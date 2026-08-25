import {
  AriaEventType,
  createAssistantDelta,
  createAssistantReply,
  type AudioChunkHandler,
  type AudioFormat,
  type IAudioPlayback,
  type IAudioSource,
  type ISTTProvider,
  type ITTSProvider,
  type IVoiceActivityDetector,
  type PluginMetadata,
  type UserUtteranceEvent,
  type VadFrameResult,
  type VoiceTurnMetricsEvent,
} from "@aria/contracts";
import { InProcessMessageBus, type Logger } from "@aria/core";
import { describe, expect, it, vi } from "vitest";
import { loadVoiceConfig } from "./config.js";
import { VoicePipeline } from "./voice-pipeline.js";

class FakeAudioSource implements IAudioSource {
  readonly format: AudioFormat = {
    sampleRateHz: 16000,
    channels: 1,
    sampleFormat: "s16le",
  };

  async start(
    _handler: AudioChunkHandler,
    signal: AbortSignal,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }

  async stop(): Promise<void> {}
}

class QueuedVad implements IVoiceActivityDetector {
  readonly metadata: PluginMetadata = {
    id: "fake-vad",
    name: "Fake VAD",
    version: "1",
  };

  constructor(private readonly results: VadFrameResult[]) {}

  async process(): Promise<VadFrameResult> {
    return (
      this.results.shift() ?? {
        probability: 0,
        speechStarted: false,
        speechEnded: false,
      }
    );
  }

  async reset(): Promise<void> {}
}

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child() {
    return this;
  },
};

/** 4 bytes of PCM — enough to assert on byte counts without real audio. */
async function* onePcmChunk(): AsyncGenerator<Uint8Array> {
  yield new Uint8Array([0, 0, 8, 0]);
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("VoicePipeline", () => {
  it("runs VAD -> STT -> brain event -> TTS -> playback and records latency", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([
      { probability: 0.9, speechStarted: true, speechEnded: false },
      { probability: 0.1, speechStarted: false, speechEnded: true },
    ]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn().mockResolvedValue({
        text: "سلام آریا",
        language: "fa",
        languageProbability: 0.99,
        durationMs: 64,
        inferenceMs: 10,
      }),
    };
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn().mockResolvedValue({
        audio: new Uint8Array([1, 2]),
        sampleRateHz: 22050,
      }),
    };
    const playback: IAudioPlayback = {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const metrics: VoiceTurnMetricsEvent[] = [];
    bus.subscribe(AriaEventType.VoiceTurnMetrics, (event) => {
      metrics.push(event as VoiceTurnMetricsEvent);
    });
    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      await bus.publish(
        createAssistantReply("سلام!", "fa", utterance.correlationId),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({}),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    const frame = new Uint8Array(1024);
    await pipeline.acceptAudioChunk(frame);
    await pipeline.acceptAudioChunk(frame);
    await waitFor(() => metrics.length === 1);

    expect(stt.transcribe).toHaveBeenCalledOnce();
    expect(tts.synthesize).toHaveBeenCalledWith(
      "سلام!",
      expect.objectContaining({ language: "fa" }),
    );
    expect(playback.play).toHaveBeenCalledOnce();
    expect(metrics[0]?.metrics.interrupted).toBe(false);
    expect(pipeline.snapshot().state).toBe("listening");

    await pipeline.stop();
    await running;
  });

  it("stops playback immediately when new speech starts", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([
      { probability: 0.9, speechStarted: true, speechEnded: false },
      { probability: 0.1, speechStarted: false, speechEnded: true },
      { probability: 0.95, speechStarted: true, speechEnded: false },
    ]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn().mockResolvedValue({
        text: "hello",
        language: "en",
        durationMs: 64,
        inferenceMs: 1,
      }),
    };
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn().mockResolvedValue({
        audio: new Uint8Array([1]),
        sampleRateHz: 22050,
      }),
    };
    const playback: IAudioPlayback = {
      play: vi.fn(
        async (_audio, _format, signal) =>
          new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          }),
      ),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    let interrupted = false;
    bus.subscribe(AriaEventType.VoiceInterrupted, () => {
      interrupted = true;
    });
    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      await bus.publish(
        createAssistantReply("Long answer", "en", utterance.correlationId),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({}),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");
    const frame = new Uint8Array(1024);
    await pipeline.acceptAudioChunk(frame);
    await pipeline.acceptAudioChunk(frame);
    await waitFor(() => pipeline.snapshot().state === "speaking");
    await pipeline.acceptAudioChunk(frame);

    expect(playback.stop).toHaveBeenCalled();
    expect(interrupted).toBe(true);
    expect(pipeline.snapshot().state).toBe("listening");

    await pipeline.stop();
    await running;
  });

  it("submitText skips STT and still runs TTS playback", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn(),
    };
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn().mockResolvedValue({
        audio: new Uint8Array([0, 0, 10, 0, 0, 0]),
        sampleRateHz: 16000,
      }),
    };
    const playback: IAudioPlayback = {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const amplitudes: number[] = [];
    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      await bus.publish(
        createAssistantReply("Typed reply", "en", utterance.correlationId),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({ ARIA_AUDIO_SOURCE: "browser" }),
    );
    pipeline.setAmplitudeListener((level) => amplitudes.push(level));
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    const reply = await pipeline.submitText("hello from text", "en");
    expect(reply).toBe("Typed reply");
    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(tts.synthesize).toHaveBeenCalledOnce();
    expect(playback.play).toHaveBeenCalledOnce();
    expect(amplitudes.length).toBeGreaterThan(0);
    expect(pipeline.snapshot().state).toBe("listening");

    await pipeline.stop();
    await running;
  });

  it("queues a new utterance while thinking instead of cancelling the reply", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([
      { probability: 0.9, speechStarted: true, speechEnded: false },
      { probability: 0.1, speechStarted: false, speechEnded: true },
      { probability: 0.95, speechStarted: true, speechEnded: false },
      { probability: 0.1, speechStarted: false, speechEnded: true },
    ]);
    let transcribeCount = 0;
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn(async () => {
        transcribeCount += 1;
        return {
          text: transcribeCount === 1 ? "first question" : "second question",
          language: "en" as const,
          durationMs: 64,
          inferenceMs: 1,
        };
      }),
    };
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn().mockResolvedValue({
        audio: new Uint8Array([1, 2, 3, 4]),
        sampleRateHz: 22050,
      }),
    };
    const playback: IAudioPlayback = {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    let interrupted = false;
    const replies: string[] = [];
    bus.subscribe(AriaEventType.VoiceInterrupted, () => {
      interrupted = true;
    });
    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      // Delay first reply so the second utterance arrives while thinking.
      if (utterance.text === "first question") {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      replies.push(utterance.text);
      await bus.publish(
        createAssistantReply(`answer:${utterance.text}`, "en", utterance.correlationId),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({}),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    // Need enough PCM so endSpeechCapture does not drop as "short"
    const frame = new Uint8Array(3200);
    await pipeline.acceptAudioChunk(frame);
    await pipeline.acceptAudioChunk(frame);
    await waitFor(() => pipeline.snapshot().state === "thinking");
    await pipeline.acceptAudioChunk(frame);
    await pipeline.acceptAudioChunk(frame);

    expect(interrupted).toBe(false);
    await waitFor(() => replies.length === 2, 2000);
    expect(replies).toEqual(["first question", "second question"]);
    expect(playback.stop).not.toHaveBeenCalled();

    await pipeline.stop();
    await running;
  });

  it("finalizeCapture starts a turn after push-to-talk release", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([
      { probability: 0.9, speechStarted: true, speechEnded: false },
      { probability: 0.9, speechStarted: false, speechEnded: false },
    ]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn().mockResolvedValue({
        text: "ptt hello",
        language: "en",
        durationMs: 64,
        inferenceMs: 1,
      }),
    };
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn().mockResolvedValue({
        audio: new Uint8Array([1, 2]),
        sampleRateHz: 22050,
      }),
    };
    const playback: IAudioPlayback = {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      await bus.publish(
        createAssistantReply("ok", "en", utterance.correlationId),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({ ARIA_AUDIO_SOURCE: "browser" }),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    const frame = new Uint8Array(3200);
    await pipeline.acceptAudioChunk(frame, "browser");
    await pipeline.acceptAudioChunk(frame, "browser");
    // No speechEnded from VAD — simulate mic release.
    await pipeline.finalizeCapture();
    await waitFor(() => vi.mocked(stt.transcribe).mock.calls.length === 1);

    expect(stt.transcribe).toHaveBeenCalledOnce();
    await pipeline.stop();
    await running;
  });

  it("queues typed text while thinking instead of cancelling the reply", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn(),
    };
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn().mockResolvedValue({
        audio: new Uint8Array([1, 2]),
        sampleRateHz: 22050,
      }),
    };
    const playback: IAudioPlayback = {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    let firstStarted = false;
    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      if (utterance.text === "slow question") {
        firstStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      await bus.publish(
        createAssistantReply(
          `answer:${utterance.text}`,
          "en",
          utterance.correlationId,
        ),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({}),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    const firstPromise = pipeline.submitText("slow question", "en");
    await waitFor(() => firstStarted);
    expect(pipeline.snapshot().state).toBe("thinking");

    const secondPromise = pipeline.submitText("fast follow-up", "en");
    const [firstReply, secondReply] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);

    expect(firstReply).toBe("answer:slow question");
    expect(secondReply).toBe("answer:fast follow-up");
    expect(playback.stop).not.toHaveBeenCalled();

    await pipeline.stop();
    await running;
  });

  it("speaks each sentence as it streams instead of waiting for the full reply", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn(),
    };
    const synthesized: string[] = [];
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn(),
      synthesizeStream: vi.fn(async (text: string) => {
        synthesized.push(text);
        return {
          sampleRateHz: 22050,
          channels: 1 as const,
          chunks: onePcmChunk(),
        };
      }),
    };
    const playedStreams: number[] = [];
    const playback: IAudioPlayback = {
      play: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      playStream: vi.fn(async (stream) => {
        let bytes = 0;
        for await (const chunk of stream.chunks) {
          bytes += chunk.byteLength;
        }
        playedStreams.push(bytes);
      }),
    };

    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      const correlationId = utterance.correlationId;
      await bus.publish(
        createAssistantDelta("First part. ", "en", correlationId, 0),
      );
      // The pipeline must already be synthesizing sentence one here; if it
      // waited for the whole turn this would time out.
      await waitFor(() => synthesized.length === 1);
      await bus.publish(
        createAssistantDelta("Second part. ", "en", correlationId, 1),
      );
      await bus.publish(createAssistantDelta("", "en", correlationId, 2, true));
      await bus.publish(
        createAssistantReply("First part. Second part.", "en", correlationId),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({}),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    const reply = await pipeline.submitText("stream please", "en");

    expect(reply).toBe("First part. Second part.");
    expect(synthesized).toEqual(["First part.", "Second part."]);
    // One sink for the whole turn, carrying both sentences.
    expect(playedStreams).toEqual([8]);
    expect(tts.synthesize).not.toHaveBeenCalled();
    expect(pipeline.snapshot().state).toBe("listening");

    await pipeline.stop();
    await running;
  });

  it("falls back to buffered synthesis when the brain sends no deltas", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn(),
    };
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn().mockResolvedValue({
        audio: new Uint8Array([0, 0, 4, 0]),
        sampleRateHz: 22050,
      }),
      synthesizeStream: vi.fn(),
    };
    const playback: IAudioPlayback = {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      playStream: vi.fn(),
    };

    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      await bus.publish(
        createAssistantReply("buffered only", "en", utterance.correlationId),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({}),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    const reply = await pipeline.submitText("no deltas", "en");

    expect(reply).toBe("buffered only");
    expect(tts.synthesizeStream).not.toHaveBeenCalled();
    expect(tts.synthesize).toHaveBeenCalledOnce();
    expect(playback.play).toHaveBeenCalledOnce();

    await pipeline.stop();
    await running;
  });

  it("flushes a terminator-less reply into the speech stream", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn(),
    };
    const synthesized: string[] = [];
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn(),
      synthesizeStream: vi.fn(async (text: string) => {
        synthesized.push(text);
        return {
          sampleRateHz: 22050,
          channels: 1 as const,
          chunks: onePcmChunk(),
        };
      }),
    };
    const playback: IAudioPlayback = {
      play: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      playStream: vi.fn(async (stream) => {
        for await (const _chunk of stream.chunks) {
          // drain
        }
      }),
    };

    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      await bus.publish(
        createAssistantDelta("سلام من خوبم", "fa", utterance.correlationId, 0),
      );
      await bus.publish(
        createAssistantReply("سلام من خوبم", "fa", utterance.correlationId),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({}),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    const reply = await pipeline.submitText("سلام", "fa");
    expect(reply).toBe("سلام من خوبم");
    expect(synthesized).toEqual(["سلام من خوبم"]);
    expect(tts.synthesize).not.toHaveBeenCalled();
    expect(playback.playStream).toHaveBeenCalledOnce();

    await pipeline.stop();
    await running;
  });

  it("falls back to buffered TTS when streaming synthesis fails", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn(),
    };
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn().mockResolvedValue({
        audio: new Uint8Array([0, 0, 4, 0]),
        sampleRateHz: 22050,
      }),
      synthesizeStream: vi.fn().mockRejectedValue(new Error("sidecar stream down")),
    };
    const playback: IAudioPlayback = {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      playStream: vi.fn(),
    };

    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      await bus.publish(
        createAssistantDelta("Hello there. ", "en", utterance.correlationId, 0),
      );
      await bus.publish(
        createAssistantDelta("", "en", utterance.correlationId, 1, true),
      );
      await bus.publish(
        createAssistantReply("Hello there.", "en", utterance.correlationId),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({}),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    const reply = await pipeline.submitText("hi", "en");
    expect(reply).toBe("Hello there.");
    expect(tts.synthesizeStream).toHaveBeenCalled();
    expect(tts.synthesize).toHaveBeenCalledOnce();
    expect(playback.play).toHaveBeenCalledOnce();
    expect(pipeline.snapshot().state).toBe("listening");

    await pipeline.stop();
    await running;
  });

  it("aborts the streaming audio and stops synthesizing on barge-in", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([
      { probability: 0.95, speechStarted: true, speechEnded: false },
    ]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn(),
    };
    let sentencesSynthesized = 0;
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn(),
      synthesizeStream: vi.fn(async () => {
        sentencesSynthesized += 1;
        return {
          sampleRateHz: 22050,
          channels: 1 as const,
          chunks: onePcmChunk(),
        };
      }),
    };
    let streamAborted = false;
    const playback: IAudioPlayback = {
      play: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      // Hold the sink open like a real player so barge-in has something to cut.
      playStream: vi.fn(
        async (_stream, signal) =>
          new Promise<void>((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                streamAborted = true;
                resolve();
              },
              { once: true },
            );
          }),
      ),
    };
    let interrupted = false;
    bus.subscribe(AriaEventType.VoiceInterrupted, () => {
      interrupted = true;
    });
    bus.subscribe(AriaEventType.ConversationUserUtterance, async (event) => {
      const utterance = event as UserUtteranceEvent;
      await bus.publish(
        createAssistantDelta(
          "A long spoken answer. ",
          "en",
          utterance.correlationId,
          0,
        ),
      );
    });

    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({ ARIA_AUDIO_SOURCE: "ffmpeg+browser" }),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    const pending = pipeline.submitText("say something long", "en");
    await waitFor(() => pipeline.snapshot().state === "speaking");

    await pipeline.acceptAudioChunk(new Uint8Array(1024), "system");

    expect(interrupted).toBe(true);
    expect(streamAborted).toBe(true);
    expect(playback.stop).toHaveBeenCalled();
    await expect(pending).resolves.toBe("");
    expect(sentencesSynthesized).toBe(1);

    await pipeline.stop();
    await running;
  });

  it("ignores system mic chunks while browser push-to-talk is active", async () => {
    const bus = new InProcessMessageBus();
    const source = new FakeAudioSource();
    const vad = new QueuedVad([
      { probability: 0.9, speechStarted: true, speechEnded: false },
    ]);
    const stt: ISTTProvider = {
      metadata: { id: "stt", name: "STT", version: "1" },
      transcribe: vi.fn(),
    };
    const tts: ITTSProvider = {
      metadata: { id: "tts", name: "TTS", version: "1" },
      synthesize: vi.fn(),
    };
    const playback: IAudioPlayback = {
      play: vi.fn(),
      stop: vi.fn(),
    };
    const pipeline = new VoicePipeline(
      source,
      playback,
      vad,
      stt,
      tts,
      bus,
      logger,
      loadVoiceConfig({ ARIA_AUDIO_SOURCE: "ffmpeg+browser" }),
    );
    const running = pipeline.start();
    await waitFor(() => pipeline.snapshot().state === "listening");

    pipeline.setBrowserCaptureActive(true);
    await pipeline.acceptAudioChunk(new Uint8Array(1024), "system");
    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(pipeline.snapshot().state).toBe("listening");

    await pipeline.stop();
    await running;
  });
});

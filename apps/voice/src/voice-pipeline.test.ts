import {
  AriaEventType,
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

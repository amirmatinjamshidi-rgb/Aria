import {
  AriaEventType,
  createUserUtterance,
  type AssistantDeltaEvent,
  type AssistantReplyEvent,
  type IAudioPlayback,
  type IAudioSource,
  type IMessageBus,
  type ISTTProvider,
  type ITTSProvider,
  type IVoiceActivityDetector,
  type LanguageCode,
  type PcmAudioStream,
  type VoicePipelineSnapshot,
  type VoicePipelineState,
  type VoiceTurnMetrics,
} from "@aria/contracts";
import type { Logger } from "@aria/core";
import {
  extractAmplitudeEnvelope,
  pcmPeakAmplitude,
  sleepMs,
} from "./audio-amplitude.js";
import type { VoiceConfig } from "./config.js";
import { resolveSttLanguageHint } from "./language.js";
import { SentenceMatcher } from "./sentence-matcher.js";
import { openSpeechStream, SentenceQueue } from "./streaming-speech.js";
import { VoiceStateMachine } from "./voice-state-machine.js";

export type AudioChunkOrigin = "system" | "browser";

export type AmplitudeListener = (level: number) => void;

interface ActiveTurn {
  readonly correlationId: string;
  readonly controller: AbortController;
  readonly speechDurationMs: number;
  readonly speechEndedAt: number;
  readonly vadMs: number;
}

interface PendingVoiceTurn {
  readonly kind: "voice";
  readonly pcm: Uint8Array;
  readonly speechDurationMs: number;
  readonly vadMs: number;
}

interface PendingTextTurn {
  readonly kind: "text";
  readonly text: string;
  readonly language: LanguageCode;
  readonly correlationId: string;
  readonly resolve: (reply: string) => void;
  readonly reject: (error: Error) => void;
}

type PendingTurn = PendingVoiceTurn | PendingTextTurn;

interface TurnDurations {
  sttMs: number;
  agentMs: number;
  ttsMs: number;
  playbackStartMs: number;
}

/** Live sentence feed for one turn, backed by `conversation.assistant_delta`. */
interface SentenceFeed {
  readonly sentences: SentenceQueue;
  /** Flush the trailing clause and stop waiting (the turn's reply has landed). */
  close(language?: LanguageCode): void;
  dispose(): void;
}

/**
 * Continuous voice pipeline with safe turn handling:
 * - Barge-in only while Aria is *speaking* (interrupt TTS).
 * - New speech during thinking/transcribing is *queued*, so the previous
 *   answer is not cancelled / vanished.
 * - Push-to-talk stop finalizes the current capture immediately.
 */
export class VoicePipeline {
  private readonly machine = new VoiceStateMachine();
  private readonly captureController = new AbortController();
  private readonly preRoll: Uint8Array[] = [];
  private speechChunks: Uint8Array[] = [];
  private speechStartedAt = 0;
  private pendingCorrelationId?: string;
  private utteranceVadMs = 0;
  private capturingSpeech = false;
  private activeTurn?: ActiveTurn;
  /** Turns captured while a non-speaking turn is active — FIFO drain after finish. */
  private readonly pendingTurns: PendingTurn[] = [];
  private browserCaptureActive = false;
  private amplitudeListener?: AmplitudeListener;

  constructor(
    private readonly audioSource: IAudioSource,
    private readonly playback: IAudioPlayback,
    private readonly vad: IVoiceActivityDetector,
    private readonly stt: ISTTProvider,
    private readonly tts: ITTSProvider,
    private readonly bus: IMessageBus,
    private readonly logger: Logger,
    private readonly config: VoiceConfig,
  ) {}

  snapshot(): VoicePipelineSnapshot {
    return {
      state: this.machine.state,
      activeCorrelationId: this.activeTurn?.correlationId,
      startedAt:
        this.speechStartedAt > 0
          ? new Date(
              Date.now() - performance.now() + this.speechStartedAt,
            ).toISOString()
          : undefined,
    };
  }

  setAmplitudeListener(listener: AmplitudeListener | undefined): void {
    this.amplitudeListener = listener;
  }

  /**
   * While true, system-mic chunks are ignored so browser push-to-talk owns the turn
   * (ffmpeg+browser mode).
   */
  setBrowserCaptureActive(active: boolean): void {
    this.browserCaptureActive = active;
  }

  /**
   * Force-end the current speech capture (push-to-talk release).
   * Without this, releasing the mic stops PCM and VAD never sees silence,
   * so the utterance never starts and appears to "vanish".
   */
  async finalizeCapture(): Promise<void> {
    if (!this.capturingSpeech) {
      return;
    }
    // Brief drain so in-flight browser PCM chunks land before PTT release.
    try {
      await sleepMs(48);
    } catch {
      // ignore
    }
    await this.endSpeechCapture();
  }

  async start(): Promise<void> {
    await this.vad.reset();
    await this.transition("listening");
    this.logger.info("continuous voice pipeline started", {
      sampleRateHz: this.audioSource.format.sampleRateHz,
      chunkDurationMs: this.config.chunkDurationMs,
      audioSourceMode: this.config.audioSourceMode,
    });

    try {
      await this.audioSource.start(
        (chunk) => this.acceptAudioChunk(chunk, "system"),
        this.captureController.signal,
      );
    } catch (error: unknown) {
      if (!this.captureController.signal.aborted) {
        await this.transition("error");
        throw error;
      }
    }
  }

  async stop(reason: "stop" | "shutdown" = "stop"): Promise<void> {
    if (this.machine.state === "idle") {
      return;
    }
    await this.transition("stopping");
    this.captureController.abort();
    await this.audioSource.stop();
    this.clearPendingTurns(new Error("Voice pipeline stopped"));
    await this.interruptActiveTurn(reason);
    await this.vad.reset();
    this.emitAmplitude(0);
    await this.transition("idle");
  }

  /** Interrupt the active turn (text or voice) without stopping capture. */
  async interrupt(
    reason: "barge_in" | "stop" | "shutdown" = "stop",
  ): Promise<void> {
    this.clearPendingTurns(
      new Error(reason === "barge_in" ? "Interrupted" : "Stopped"),
    );
    await this.interruptActiveTurn(reason);
    if (this.machine.state !== "idle" && this.machine.state !== "stopping") {
      await this.transition("listening");
    }
    this.emitAmplitude(0);
  }

  /**
   * Text fallback path: skip STT, run brain + TTS + playback with barge-in.
   */
  async submitText(
    text: string,
    language: LanguageCode,
    correlationId?: string,
  ): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Empty text");
    }
    if (this.machine.state === "idle" || this.machine.state === "stopping") {
      throw new Error("Voice pipeline is not running");
    }

    if (
      this.activeTurn &&
      (this.machine.state === "thinking" ||
        this.machine.state === "transcribing")
    ) {
      return new Promise<string>((resolve, reject) => {
        this.enqueuePending({
          kind: "text",
          text: trimmed,
          language,
          correlationId: correlationId ?? crypto.randomUUID(),
          resolve,
          reject,
        });
      });
    }

    if (this.activeTurn && this.machine.state === "speaking") {
      await this.interruptActiveTurn("barge_in");
    }

    const turn: ActiveTurn = {
      correlationId: correlationId ?? crypto.randomUUID(),
      controller: new AbortController(),
      speechDurationMs: 0,
      speechEndedAt: performance.now(),
      vadMs: 0,
    };
    this.activeTurn = turn;

    try {
      return await this.runTextTurn(turn, trimmed, language);
    } catch (error: unknown) {
      if (turn.controller.signal.aborted) {
        return "";
      }
      throw error;
    }
  }

  /** Public for tests, browser gateway PCM, and non-FFmpeg adapters. */
  async acceptAudioChunk(
    chunk: Uint8Array,
    origin: AudioChunkOrigin = "system",
  ): Promise<void> {
    if (this.machine.state === "idle" || this.machine.state === "stopping") {
      return;
    }

    if (!this.shouldAcceptOrigin(origin)) {
      return;
    }

    if (
      this.machine.state === "listening" ||
      this.machine.state === "speaking"
    ) {
      this.emitAmplitude(pcmPeakAmplitude(chunk));
    }

    if (this.capturingSpeech) {
      this.speechChunks.push(chunk);
    } else {
      this.pushPreRoll(chunk);
    }

    const vadStartedAt = performance.now();
    const result = await this.vad.process(
      chunk,
      this.audioSource.format,
      this.captureController.signal,
    );
    this.utteranceVadMs += performance.now() - vadStartedAt;

    if (result.speechStarted && !this.capturingSpeech) {
      await this.beginSpeechCapture();
    }

    const speechBytes = this.speechChunks.reduce(
      (sum, frame) => sum + frame.byteLength,
      0,
    );
    const speechDurationMs =
      (speechBytes / (this.audioSource.format.sampleRateHz * 2)) * 1000;

    if (
      this.capturingSpeech &&
      (result.speechEnded || speechDurationMs >= this.config.maxUtteranceMs)
    ) {
      await this.endSpeechCapture();
    }
  }

  private async beginSpeechCapture(): Promise<void> {
    // Only barge-in while Aria is speaking. During thinking/transcribing,
    // keep the active turn and queue the new utterance instead.
    if (this.activeTurn && this.machine.state === "speaking") {
      await this.interruptActiveTurn("barge_in");
    }

    this.capturingSpeech = true;
    this.speechStartedAt = performance.now();
    this.pendingCorrelationId = crypto.randomUUID();
    this.speechChunks = this.preRoll.map((frame) => Uint8Array.from(frame));
    this.preRoll.length = 0;

    if (!this.activeTurn || this.machine.state === "speaking") {
      await this.transition("listening");
    }

    await this.bus.publish({
      type: AriaEventType.VoiceSpeechStarted,
      correlationId: this.pendingCorrelationId,
      timestamp: new Date().toISOString(),
    });
  }

  private async endSpeechCapture(): Promise<void> {
    if (!this.capturingSpeech) {
      return;
    }

    const pcm = this.concatFrames(this.speechChunks);
    const speechBytes = pcm.byteLength;
    const speechDurationMs =
      (speechBytes / (this.audioSource.format.sampleRateHz * 2)) * 1000;
    const vadMs = this.utteranceVadMs;

    this.capturingSpeech = false;
    this.speechChunks = [];
    this.speechStartedAt = 0;
    this.utteranceVadMs = 0;
    this.pendingCorrelationId = undefined;

    if (speechBytes < this.audioSource.format.sampleRateHz * 2 * 0.05) {
      // Drop near-empty captures (< ~50ms — click noise / accidental PTT).
      this.logger.debug("dropping empty/short speech capture", {
        speechDurationMs,
      });
      return;
    }

    // Busy with a non-speaking turn → queue; do not cancel the previous answer.
    if (
      this.activeTurn &&
      (this.machine.state === "thinking" ||
        this.machine.state === "transcribing")
    ) {
      this.enqueuePending({ kind: "voice", pcm, speechDurationMs, vadMs });
      this.logger.info("queued utterance until current turn finishes", {
        activeCorrelationId: this.activeTurn.correlationId,
        speechDurationMs,
        queueDepth: this.pendingTurns.length,
      });
      return;
    }

    if (this.activeTurn && this.machine.state === "speaking") {
      await this.interruptActiveTurn("barge_in");
    }

    this.startVoiceTurn(pcm, speechDurationMs, vadMs);
  }

  private startVoiceTurn(
    pcm: Uint8Array,
    speechDurationMs: number,
    vadMs: number,
  ): void {
    const turn: ActiveTurn = {
      correlationId: crypto.randomUUID(),
      controller: new AbortController(),
      speechDurationMs,
      speechEndedAt: performance.now(),
      vadMs,
    };
    this.activeTurn = turn;
    void this.runTurn(turn, pcm).catch((error: unknown) => {
      this.logger.error("voice turn failed", {
        correlationId: turn.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private shouldAcceptOrigin(origin: AudioChunkOrigin): boolean {
    const mode = this.config.audioSourceMode;
    switch (mode) {
      case "ffmpeg":
        return origin === "system";
      case "browser":
        return origin === "browser";
      case "ffmpeg+browser":
        if (this.browserCaptureActive) {
          return origin === "browser";
        }
        return origin === "system";
      default: {
        const _exhaustive: never = mode;
        return _exhaustive;
      }
    }
  }

  private async runTextTurn(
    turn: ActiveTurn,
    text: string,
    language: LanguageCode,
  ): Promise<string> {
    const durations = {
      sttMs: 0,
      agentMs: 0,
      ttsMs: 0,
      playbackStartMs: 0,
    };
    let interrupted = false;

    try {
      await this.transitionIfActive(turn, "thinking");
      const reply = await this.answerAndSpeak(turn, durations, () =>
        this.bus.publish(
          createUserUtterance(text, language, turn.correlationId),
        ),
      );
      interrupted = !this.isActive(turn);
      await this.finishTurn(turn, durations, interrupted);
      return reply.text;
    } catch (error: unknown) {
      if (turn.controller.signal.aborted) {
        interrupted = true;
        await this.finishTurn(turn, durations, interrupted);
        return "";
      }
      if (this.isActive(turn)) {
        await this.transition("error", turn.correlationId);
        this.activeTurn = undefined;
      }
      throw error;
    }
  }

  private async runTurn(turn: ActiveTurn, pcm: Uint8Array): Promise<void> {
    const durations = {
      sttMs: 0,
      agentMs: 0,
      ttsMs: 0,
      playbackStartMs: 0,
    };
    let interrupted = false;

    try {
      await this.transitionIfActive(turn, "transcribing");
      const startedStt = performance.now();
      const transcription = await this.stt.transcribe(pcm, {
        languageHint: resolveSttLanguageHint(this.config.languageMode),
        sampleRateHz: this.audioSource.format.sampleRateHz,
        beamSize: this.config.sttBeamSize,
        signal: turn.controller.signal,
      });
      durations.sttMs = performance.now() - startedStt;

      if (!transcription.text.trim() || !this.isActive(turn)) {
        await this.finishTurn(turn, durations, interrupted);
        return;
      }

      await this.bus.publish({
        type: AriaEventType.VoiceTranscriptionCompleted,
        correlationId: turn.correlationId,
        transcription,
        timestamp: new Date().toISOString(),
      });

      await this.transitionIfActive(turn, "thinking");
      await this.answerAndSpeak(turn, durations, () =>
        this.bus.publish(
          createUserUtterance(
            transcription.text.trim(),
            transcription.language,
            turn.correlationId,
          ),
        ),
      );
      interrupted = !this.isActive(turn);
      await this.finishTurn(turn, durations, interrupted);
    } catch (error: unknown) {
      if (turn.controller.signal.aborted) {
        interrupted = true;
        await this.finishTurn(turn, durations, interrupted);
        return;
      }
      if (this.isActive(turn)) {
        await this.transition("error", turn.correlationId);
        this.activeTurn = undefined;
      }
      throw error;
    }
  }

  /**
   * Publish the utterance, then speak the answer.
   *
   * Prefers the streaming path: sentences are pulled off
   * `conversation.assistant_delta` and synthesized as they complete, so the
   * first sentence plays while the brain is still generating. Falls back to
   * buffered synthesis of the whole reply when the brain sends no deltas or the
   * TTS/playback adapters cannot stream.
   */
  private async answerAndSpeak(
    turn: ActiveTurn,
    durations: TurnDurations,
    publishUtterance: () => Promise<void>,
  ): Promise<AssistantReplyEvent> {
    const startedAgent = performance.now();
    const feed = this.openSentenceFeed(turn);
    const replyPromise = this.waitForReply(turn).then((reply) => {
      durations.agentMs = performance.now() - startedAgent;
      // Flush any trailing clause the matcher was still holding, then release
      // the consumer. Deltas normally already did this via `done`; this is the
      // safety net when the brain published a reply without a done delta.
      feed?.close(reply.language);
      return reply;
    });

    void publishUtterance().catch((error: unknown) => {
      this.logger.error("failed to publish utterance", {
        correlationId: turn.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    try {
      if (feed) {
        try {
          const spoken = await this.speakStreamed(turn, feed, durations);
          if (spoken) {
            return await replyPromise;
          }
          this.logger.debug("no assistant deltas — using buffered synthesis", {
            correlationId: turn.correlationId,
          });
        } catch (error: unknown) {
          this.logger.warn("streaming speech failed — falling back to buffered TTS", {
            correlationId: turn.correlationId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const reply = await replyPromise;
      if (this.isActive(turn)) {
        await this.speakBuffered(turn, reply, durations);
      }
      return reply;
    } finally {
      feed?.dispose();
    }
  }

  /** Returns false when the delta stream yielded nothing to speak. */
  private async speakStreamed(
    turn: ActiveTurn,
    feed: SentenceFeed,
    durations: TurnDurations,
  ): Promise<boolean> {
    const startedTts = performance.now();
    const firstAudio = new AbortController();
    const onTurnAbort = (): void => firstAudio.abort();
    turn.controller.signal.addEventListener("abort", onTurnAbort, { once: true });
    const timeout = setTimeout(
      () => firstAudio.abort(),
      this.config.streamingFirstAudioTimeoutMs,
    );

    let stream: PcmAudioStream | undefined;
    try {
      stream = await openSpeechStream({
        tts: this.tts,
        sentences: feed.sentences,
        signal: firstAudio.signal,
        onSentence: (sentence) => {
          this.logger.debug("speaking sentence", {
            correlationId: turn.correlationId,
            chars: sentence.text.length,
          });
        },
        onWarning: (message) => {
          this.logger.warn(message, { correlationId: turn.correlationId });
        },
      });
    } finally {
      clearTimeout(timeout);
      turn.controller.signal.removeEventListener("abort", onTurnAbort);
    }

    if (!stream) {
      return false;
    }
    durations.ttsMs = performance.now() - startedTts;

    await this.transitionIfActive(turn, "speaking");
    durations.playbackStartMs = performance.now() - turn.speechEndedAt;
    await this.playStreamWithAmplitude(turn, stream);
    return true;
  }

  private async speakBuffered(
    turn: ActiveTurn,
    reply: AssistantReplyEvent,
    durations: TurnDurations,
  ): Promise<void> {
    const startedTts = performance.now();
    const speech = await this.tts.synthesize(reply.text, {
      language: reply.language,
      signal: turn.controller.signal,
    });
    durations.ttsMs = performance.now() - startedTts;

    await this.transitionIfActive(turn, "speaking");
    durations.playbackStartMs = performance.now() - turn.speechEndedAt;
    await this.playWithAmplitude(turn, speech.audio, speech.sampleRateHz);
  }

  /**
   * Subscribe to this turn's token deltas and segment them into sentences.
   * Returns undefined when streaming speech is unavailable.
   */
  private openSentenceFeed(turn: ActiveTurn): SentenceFeed | undefined {
    if (
      !this.config.streamingSpeech ||
      typeof this.tts.synthesizeStream !== "function" ||
      typeof this.playback.playStream !== "function"
    ) {
      return undefined;
    }

    const matcher = new SentenceMatcher({
      maxChars: this.config.sentenceMaxChars,
    });
    const sentences = new SentenceQueue();
    let lastLanguage: LanguageCode = "en";

    const unsubscribe = this.bus.subscribe(
      AriaEventType.ConversationAssistantDelta,
      (event) => {
        const delta = event as AssistantDeltaEvent;
        if (delta.correlationId !== turn.correlationId) {
          return;
        }
        lastLanguage = delta.language;
        for (const text of matcher.push(delta.delta)) {
          sentences.push({ text, language: delta.language });
        }
        if (delta.done) {
          for (const text of matcher.flush()) {
            sentences.push({ text, language: delta.language });
          }
          sentences.close();
        }
      },
    );

    const onAbort = (): void => {
      sentences.fail(new DOMException("Voice turn interrupted", "AbortError"));
    };
    turn.controller.signal.addEventListener("abort", onAbort, { once: true });

    const flushAndClose = (language?: LanguageCode): void => {
      const voice = language ?? lastLanguage;
      for (const text of matcher.flush()) {
        sentences.push({ text, language: voice });
      }
      sentences.close();
    };

    return {
      sentences,
      close: flushAndClose,
      dispose: () => {
        unsubscribe();
        turn.controller.signal.removeEventListener("abort", onAbort);
        flushAndClose();
      },
    };
  }

  /**
   * Play a live PCM stream while driving the amplitude meter.
   *
   * Levels are computed as chunks pass through and then emitted on a real-time
   * timer: chunks are written to the sink faster than playback consumes them, so
   * emitting per chunk would run the meter ahead of the audio.
   */
  private async playStreamWithAmplitude(
    turn: ActiveTurn,
    stream: PcmAudioStream,
  ): Promise<void> {
    const playStream = this.playback.playStream;
    if (!playStream) {
      throw new Error("Audio playback adapter does not support streaming");
    }

    const windowMs = 32;
    const levels: number[] = [];
    let drained = false;

    const tap = async function* (
      source: AsyncIterable<Uint8Array>,
    ): AsyncGenerator<Uint8Array> {
      try {
        for await (const chunk of source) {
          levels.push(
            ...extractAmplitudeEnvelope(chunk, stream.sampleRateHz, windowMs),
          );
          yield chunk;
        }
      } finally {
        drained = true;
      }
    };

    const playPromise = playStream.call(
      this.playback,
      {
        sampleRateHz: stream.sampleRateHz,
        channels: stream.channels,
        chunks: tap(stream.chunks),
      },
      turn.controller.signal,
    );

    const emitLoop = async (): Promise<void> => {
      try {
        while (!turn.controller.signal.aborted && this.isActive(turn)) {
          const level = levels.shift();
          if (level === undefined && drained) {
            break;
          }
          this.emitAmplitude(level ?? 0);
          await sleepMs(windowMs, turn.controller.signal);
        }
      } catch {
        // aborted during sleep
      } finally {
        this.emitAmplitude(0);
      }
    };

    await Promise.all([playPromise, emitLoop()]);
  }

  private async playWithAmplitude(
    turn: ActiveTurn,
    audio: Uint8Array,
    sampleRateHz: number,
  ): Promise<void> {
    const windowMs = 32;
    const levels = extractAmplitudeEnvelope(audio, sampleRateHz, windowMs);
    const playPromise = this.playback.play(
      audio,
      { sampleRateHz, channels: 1 },
      turn.controller.signal,
    );

    const emitLoop = async (): Promise<void> => {
      try {
        for (const level of levels) {
          if (turn.controller.signal.aborted || !this.isActive(turn)) {
            break;
          }
          this.emitAmplitude(level);
          await sleepMs(windowMs, turn.controller.signal);
        }
      } catch {
        // aborted during sleep
      } finally {
        this.emitAmplitude(0);
      }
    };

    await Promise.all([playPromise, emitLoop()]);
  }

  private emitAmplitude(level: number): void {
    this.amplitudeListener?.(level);
  }

  private waitForReply(turn: ActiveTurn): Promise<AssistantReplyEvent> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for the brain response"));
      }, 120_000);
      const onAbort = () => {
        clearTimeout(timeout);
        unsubscribe();
        reject(new DOMException("Voice turn interrupted", "AbortError"));
      };
      const unsubscribe = this.bus.subscribe(
        AriaEventType.ConversationAssistantReply,
        (event) => {
          const reply = event as AssistantReplyEvent;
          if (reply.correlationId !== turn.correlationId) {
            return;
          }
          clearTimeout(timeout);
          turn.controller.signal.removeEventListener("abort", onAbort);
          unsubscribe();
          resolve(reply);
        },
      );
      turn.controller.signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async interruptActiveTurn(
    reason: "barge_in" | "stop" | "shutdown",
  ): Promise<void> {
    const turn = this.activeTurn;
    if (!turn) {
      return;
    }
    turn.controller.abort();
    await this.playback.stop();
    this.activeTurn = undefined;
    this.emitAmplitude(0);
    await this.bus.publish({
      type: AriaEventType.VoiceInterrupted,
      correlationId: turn.correlationId,
      reason,
      timestamp: new Date().toISOString(),
    });
    this.logger.info("voice turn interrupted", {
      correlationId: turn.correlationId,
      reason,
    });
  }

  private async finishTurn(
    turn: ActiveTurn,
    durations: {
      sttMs: number;
      agentMs: number;
      ttsMs: number;
      playbackStartMs: number;
    },
    interrupted: boolean,
  ): Promise<void> {
    const metrics: VoiceTurnMetrics = {
      correlationId: turn.correlationId,
      speechDurationMs: turn.speechDurationMs,
      vadMs: turn.vadMs,
      ...durations,
      totalMs: performance.now() - turn.speechEndedAt,
      interrupted,
      timestamp: new Date().toISOString(),
    };
    await this.bus.publish({
      type: AriaEventType.VoiceTurnMetrics,
      correlationId: turn.correlationId,
      metrics,
      timestamp: metrics.timestamp,
    });
    this.logger.info("voice turn metrics", {
      ...metrics,
    });

    if (this.isActive(turn)) {
      this.activeTurn = undefined;
      await this.transition("listening");
    }

    this.drainNextPending();
  }

  private enqueuePending(turn: PendingTurn): void {
    const max = this.config.maxPendingTurns;
    while (this.pendingTurns.length >= max) {
      const dropped = this.pendingTurns.shift();
      if (dropped?.kind === "text") {
        dropped.reject(new Error("Turn queue full — dropped oldest request"));
      }
      this.logger.warn("dropped oldest queued turn (queue full)", {
        maxPendingTurns: max,
      });
    }
    this.pendingTurns.push(turn);
  }

  private clearPendingTurns(error?: Error): void {
    for (const pending of this.pendingTurns.splice(0)) {
      if (pending.kind === "text") {
        pending.reject(error ?? new Error("Voice turn queue cleared"));
      }
    }
  }

  private drainNextPending(): void {
    if (this.activeTurn || this.machine.state !== "listening") {
      return;
    }
    const next = this.pendingTurns.shift();
    if (!next) {
      return;
    }

    if (next.kind === "voice") {
      this.logger.info("starting queued voice utterance", {
        speechDurationMs: next.speechDurationMs,
        queueRemaining: this.pendingTurns.length,
      });
      this.startVoiceTurn(next.pcm, next.speechDurationMs, next.vadMs);
      return;
    }

    const turn: ActiveTurn = {
      correlationId: next.correlationId,
      controller: new AbortController(),
      speechDurationMs: 0,
      speechEndedAt: performance.now(),
      vadMs: 0,
    };
    this.activeTurn = turn;
    this.logger.info("starting queued text turn", {
      correlationId: next.correlationId,
      queueRemaining: this.pendingTurns.length,
    });
    void this.runTextTurn(turn, next.text, next.language)
      .then(next.resolve)
      .catch((error: unknown) => {
        next.reject(error instanceof Error ? error : new Error(String(error)));
      });
  }

  private async transitionIfActive(
    turn: ActiveTurn,
    state: VoicePipelineState,
  ): Promise<void> {
    if (this.isActive(turn)) {
      await this.transition(state, turn.correlationId);
    }
  }

  private isActive(turn: ActiveTurn): boolean {
    return (
      this.activeTurn?.correlationId === turn.correlationId &&
      !turn.controller.signal.aborted
    );
  }

  private async transition(
    next: VoicePipelineState,
    correlationId?: string,
  ): Promise<void> {
    const changed = this.machine.transition(next);
    if (changed.previous === changed.current) {
      return;
    }
    await this.bus.publish({
      type: AriaEventType.VoiceStateChanged,
      correlationId,
      previous: changed.previous,
      current: changed.current,
      timestamp: new Date().toISOString(),
    });
  }

  private pushPreRoll(chunk: Uint8Array): void {
    this.preRoll.push(Uint8Array.from(chunk));
    const maxFrames = Math.max(
      1,
      Math.ceil(this.config.preSpeechMs / this.config.chunkDurationMs),
    );
    while (this.preRoll.length > maxFrames) {
      this.preRoll.shift();
    }
  }

  private concatFrames(frames: readonly Uint8Array[]): Uint8Array {
    const size = frames.reduce((sum, frame) => sum + frame.byteLength, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    for (const frame of frames) {
      result.set(frame, offset);
      offset += frame.byteLength;
    }
    return result;
  }
}

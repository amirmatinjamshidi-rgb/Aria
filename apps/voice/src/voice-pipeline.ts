import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
  type IAudioPlayback,
  type IAudioSource,
  type IMessageBus,
  type ISTTProvider,
  type ITTSProvider,
  type IVoiceActivityDetector,
  type LanguageCode,
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
    await this.interruptActiveTurn(reason);
    await this.vad.reset();
    this.emitAmplitude(0);
    await this.transition("idle");
  }

  /** Interrupt the active turn (text or voice) without stopping capture. */
  async interrupt(
    reason: "barge_in" | "stop" | "shutdown" = "stop",
  ): Promise<void> {
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

    if (this.activeTurn) {
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
      if (this.activeTurn) {
        await this.interruptActiveTurn("barge_in");
      }
      this.capturingSpeech = true;
      this.speechStartedAt = performance.now();
      this.pendingCorrelationId = crypto.randomUUID();
      this.speechChunks = this.preRoll.map((frame) => Uint8Array.from(frame));
      this.preRoll.length = 0;
      await this.transition("listening");

      await this.bus.publish({
        type: AriaEventType.VoiceSpeechStarted,
        correlationId: this.pendingCorrelationId,
        timestamp: new Date().toISOString(),
      });
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
      const pcm = this.concatFrames(this.speechChunks);
      const turn: ActiveTurn = {
        correlationId: this.pendingCorrelationId ?? crypto.randomUUID(),
        controller: new AbortController(),
        speechDurationMs,
        speechEndedAt: performance.now(),
        vadMs: this.utteranceVadMs,
      };
      this.activeTurn = turn;
      this.capturingSpeech = false;
      this.speechChunks = [];
      this.speechStartedAt = 0;
      this.pendingCorrelationId = undefined;
      this.utteranceVadMs = 0;
      void this.runTurn(turn, pcm).catch((error: unknown) => {
        this.logger.error("voice turn failed", {
          correlationId: turn.correlationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
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
      const startedAgent = performance.now();
      const replyPromise = this.waitForReply(turn);
      void this.bus
        .publish(createUserUtterance(text, language, turn.correlationId))
        .catch((error: unknown) => {
          this.logger.error("failed to publish text utterance", {
            correlationId: turn.correlationId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      const reply = await replyPromise;
      durations.agentMs = performance.now() - startedAgent;

      if (!this.isActive(turn)) {
        interrupted = true;
        await this.finishTurn(turn, durations, interrupted);
        return reply.text;
      }

      const startedTts = performance.now();
      // #region agent log
      fetch('http://127.0.0.1:7428/ingest/11d91261-a0f9-451d-8c69-0c07ca2c5204',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8aa307'},body:JSON.stringify({sessionId:'8aa307',hypothesisId:'C',location:'voice-pipeline.ts:runTextTurn',message:'text turn before TTS',data:{correlationId:turn.correlationId,replyLen:reply.text.length,language:reply.language,agentMs:durations.agentMs},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const speech = await this.tts.synthesize(reply.text, {
        language: reply.language,
        signal: turn.controller.signal,
      });
      durations.ttsMs = performance.now() - startedTts;

      await this.transitionIfActive(turn, "speaking");
      durations.playbackStartMs = performance.now() - turn.speechEndedAt;
      await this.playWithAmplitude(
        turn,
        speech.audio,
        speech.sampleRateHz,
      );
      await this.finishTurn(turn, durations, interrupted);
      return reply.text;
    } catch (error: unknown) {
      // #region agent log
      fetch('http://127.0.0.1:7428/ingest/11d91261-a0f9-451d-8c69-0c07ca2c5204',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8aa307'},body:JSON.stringify({sessionId:'8aa307',hypothesisId:'C',location:'voice-pipeline.ts:runTextTurn',message:'text turn failed',data:{correlationId:turn.correlationId,message:error instanceof Error ? error.message : String(error),state:this.machine.state},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
        languageHint: "auto",
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
      const startedAgent = performance.now();
      const replyPromise = this.waitForReply(turn);
      void this.bus
        .publish(
          createUserUtterance(
            transcription.text.trim(),
            transcription.language,
            turn.correlationId,
          ),
        )
        .catch((error: unknown) => {
          this.logger.error("failed to publish voice utterance", {
            correlationId: turn.correlationId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      const reply = await replyPromise;
      durations.agentMs = performance.now() - startedAgent;

      if (!this.isActive(turn)) {
        interrupted = true;
        await this.finishTurn(turn, durations, interrupted);
        return;
      }

      const startedTts = performance.now();
      const speech = await this.tts.synthesize(reply.text, {
        language: reply.language,
        signal: turn.controller.signal,
      });
      durations.ttsMs = performance.now() - startedTts;

      await this.transitionIfActive(turn, "speaking");
      durations.playbackStartMs = performance.now() - turn.speechEndedAt;
      await this.playWithAmplitude(
        turn,
        speech.audio,
        speech.sampleRateHz,
      );
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

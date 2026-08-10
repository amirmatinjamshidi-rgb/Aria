import type {
  AudioChunkHandler,
  AudioFormat,
  IAudioSource,
} from "@aria/contracts";

/**
 * No-op capture source for browser-only mode.
 * PCM arrives via VoicePipeline.acceptAudioChunk from the web gateway.
 */
export class IdleAudioSource implements IAudioSource {
  readonly format: AudioFormat;

  constructor(sampleRateHz: number = 16000) {
    this.format = {
      sampleRateHz: sampleRateHz as 16000,
      channels: 1,
      sampleFormat: "s16le",
    };
  }

  async start(
    _handler: AudioChunkHandler,
    signal: AbortSignal,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }

  async stop(): Promise<void> {}
}

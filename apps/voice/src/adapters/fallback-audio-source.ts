import type {
  AudioChunkHandler,
  AudioFormat,
  IAudioSource,
} from "@aria/contracts";

/**
 * Tries a primary capture source; on failure keeps the pipeline alive via fallback
 * (typically IdleAudioSource for browser/text-only).
 */
export class FallbackAudioSource implements IAudioSource {
  readonly format: AudioFormat;

  constructor(
    private readonly primary: IAudioSource,
    private readonly fallback: IAudioSource,
    private readonly onFallback?: (error: unknown) => void,
  ) {
    this.format = primary.format;
  }

  async start(
    handler: AudioChunkHandler,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.primary.start(handler, signal);
    } catch (error: unknown) {
      if (signal.aborted) {
        return;
      }
      this.onFallback?.(error);
      await this.fallback.start(handler, signal);
    }
  }

  async stop(): Promise<void> {
    await this.primary.stop();
    await this.fallback.stop();
  }
}

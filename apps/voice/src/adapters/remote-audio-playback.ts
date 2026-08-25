import type { IAudioPlayback, PcmAudioStream } from "@aria/contracts";
import { sleepMs } from "../audio-amplitude.js";
import { PcmCoalescer } from "../pcm-bytes.js";

export type RemoteAudioEvent =
  | { type: "start"; sampleRateHz: number; channels: 1 }
  | { type: "chunk"; pcm: Uint8Array }
  | { type: "stop"; reason: "end" | "interrupt" };

export type RemoteAudioListener = (event: RemoteAudioEvent) => void;

/**
 * Playback sink for the web lab: PCM is forwarded to the dashboard over the
 * gateway WebSocket and played in the browser. ffplay is not used here so the
 * user hears Aria in the tab instead of (or missing from) a server-side device.
 */
export class RemoteAudioPlayback implements IAudioPlayback {
  private listener?: RemoteAudioListener;
  private active?: AbortController;

  setListener(listener: RemoteAudioListener | undefined): void {
    this.listener = listener;
  }

  async play(
    audio: Uint8Array,
    format: { sampleRateHz: number; channels: 1 },
    signal: AbortSignal,
  ): Promise<void> {
    const local = this.begin(signal);
    this.listener?.({
      type: "start",
      sampleRateHz: format.sampleRateHz,
      channels: 1,
    });
    this.listener?.({ type: "chunk", pcm: audio });
    const durationMs = pcmDurationMs(audio.byteLength, format.sampleRateHz);
    try {
      await sleepMs(durationMs, local.signal);
    } catch (error: unknown) {
      if (!isAbort(error)) {
        throw error;
      }
    } finally {
      this.finish(local, local.signal.aborted ? "interrupt" : "end");
    }
  }

  async playStream(stream: PcmAudioStream, signal: AbortSignal): Promise<void> {
    const local = this.begin(signal);
    this.listener?.({
      type: "start",
      sampleRateHz: stream.sampleRateHz,
      channels: 1,
    });
    let bytes = 0;
    const started = performance.now();
    const coalescer = new PcmCoalescer(
      Math.max(2, Math.floor(stream.sampleRateHz * 0.02) * 2),
    );
    try {
      for await (const chunk of stream.chunks) {
        if (local.signal.aborted) {
          break;
        }
        if (chunk.byteLength === 0) {
          continue;
        }
        for (const frame of coalescer.push(chunk)) {
          bytes += frame.byteLength;
          this.listener?.({ type: "chunk", pcm: frame });
        }
      }
      if (!local.signal.aborted) {
        for (const frame of coalescer.flush()) {
          bytes += frame.byteLength;
          this.listener?.({ type: "chunk", pcm: frame });
        }
        const remaining =
          pcmDurationMs(bytes, stream.sampleRateHz) -
          (performance.now() - started);
        if (remaining > 16) {
          await sleepMs(remaining, local.signal);
        }
      }
    } catch (error: unknown) {
      if (!isAbort(error)) {
        throw error;
      }
    } finally {
      this.finish(local, local.signal.aborted ? "interrupt" : "end");
    }
  }

  async stop(): Promise<void> {
    this.active?.abort();
    this.active = undefined;
    this.listener?.({ type: "stop", reason: "interrupt" });
  }

  private begin(signal: AbortSignal): AbortController {
    this.active?.abort();
    const local = new AbortController();
    this.active = local;
    if (signal.aborted) {
      local.abort();
    } else {
      signal.addEventListener("abort", () => local.abort(), { once: true });
    }
    return local;
  }

  private finish(
    local: AbortController,
    reason: "end" | "interrupt",
  ): void {
    if (this.active === local) {
      this.active = undefined;
    }
    this.listener?.({ type: "stop", reason });
  }
}

function pcmDurationMs(byteLength: number, sampleRateHz: number): number {
  if (sampleRateHz <= 0) {
    return 0;
  }
  return (byteLength / 2 / sampleRateHz) * 1000;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

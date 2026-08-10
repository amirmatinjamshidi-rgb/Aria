/**
 * Peak amplitude (0..1) of a signed 16-bit little-endian PCM buffer.
 */
export function pcmPeakAmplitude(pcm: Uint8Array): number {
  if (pcm.byteLength < 2) {
    return 0;
  }
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let peak = 0;
  for (let i = 0; i + 1 < view.byteLength; i += 2) {
    const sample = Math.abs(view.getInt16(i, true));
    if (sample > peak) {
      peak = sample;
    }
  }
  return Math.min(1, peak / 32768);
}

/**
 * Split PCM into windowed peak envelopes for UI animation during playback.
 */
export function extractAmplitudeEnvelope(
  pcm: Uint8Array,
  sampleRateHz: number,
  windowMs = 32,
): number[] {
  const bytesPerWindow = Math.max(
    2,
    Math.floor((sampleRateHz * 2 * windowMs) / 1000),
  );
  const levels: number[] = [];
  for (let offset = 0; offset < pcm.byteLength; offset += bytesPerWindow) {
    const slice = pcm.subarray(
      offset,
      Math.min(offset + bytesPerWindow, pcm.byteLength),
    );
    levels.push(pcmPeakAmplitude(slice));
  }
  return levels.length > 0 ? levels : [0];
}

export function sleepMs(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

import { describe, expect, it } from "vitest";
import {
  extractAmplitudeEnvelope,
  pcmPeakAmplitude,
} from "./audio-amplitude.js";

describe("audio-amplitude", () => {
  it("reports peak amplitude for s16le PCM", () => {
    const pcm = new Uint8Array(4);
    const view = new DataView(pcm.buffer);
    view.setInt16(0, 0, true);
    view.setInt16(2, 16384, true);
    expect(pcmPeakAmplitude(pcm)).toBeCloseTo(0.5, 2);
  });

  it("builds a non-empty envelope", () => {
    const pcm = new Uint8Array(3200);
    const levels = extractAmplitudeEnvelope(pcm, 16000, 32);
    expect(levels.length).toBeGreaterThan(0);
  });
});

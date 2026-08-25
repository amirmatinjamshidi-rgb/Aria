import { describe, expect, it } from "vitest";
import { PcmCoalescer, S16leChunkAligner } from "./pcm-bytes.js";

describe("S16leChunkAligner", () => {
  it("holds a trailing odd byte until the next chunk completes the sample", () => {
    const aligner = new S16leChunkAligner();
    expect(aligner.push(Uint8Array.from([0x01]))).toBeUndefined();
    const aligned = aligner.push(Uint8Array.from([0x02, 0x03, 0x04]));
    expect(Array.from(aligned ?? [])).toEqual([0x01, 0x02, 0x03, 0x04]);
  });
});

describe("PcmCoalescer", () => {
  it("emits even frames of at least minBytes", () => {
    const coalescer = new PcmCoalescer(4);
    expect(coalescer.push(Uint8Array.from([1, 2]))).toEqual([]);
    const frames = coalescer.push(Uint8Array.from([3, 4, 5, 6]));
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0] ?? [])).toEqual([1, 2, 3, 4]);
    expect(Array.from(coalescer.flush()[0] ?? [])).toEqual([5, 6]);
  });

  it("does not emit a frame that still has a dangling odd byte", () => {
    const coalescer = new PcmCoalescer(4);
    expect(coalescer.push(Uint8Array.from([1, 2, 3]))).toEqual([]);
    const frames = coalescer.push(Uint8Array.from([4]));
    expect(Array.from(frames[0] ?? [])).toEqual([1, 2, 3, 4]);
  });
});

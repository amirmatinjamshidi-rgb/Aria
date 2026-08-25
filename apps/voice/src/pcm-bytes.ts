/**
 * s16le PCM helpers. HTTP/WS frames can split a 16-bit sample in half;
 * playing those frames as independent buffers sounds like harsh static.
 */

export function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(left.byteLength + right.byteLength);
  out.set(left, 0);
  out.set(right, left.byteLength);
  return out;
}

/** Reassemble a byte stream into even-length s16le frames. */
export class S16leChunkAligner {
  private leftover: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array | undefined {
    if (chunk.byteLength === 0 && this.leftover.byteLength === 0) {
      return undefined;
    }
    const combined = concatBytes(this.leftover, chunk);
    const even = combined.byteLength & ~1;
    this.leftover =
      even < combined.byteLength
        ? combined.slice(even)
        : new Uint8Array(0);
    return even > 0 ? combined.subarray(0, even) : undefined;
  }

  flush(): Uint8Array | undefined {
    const leftover = this.leftover;
    this.leftover = new Uint8Array(0);
    return leftover.byteLength >= 2 ? leftover.subarray(0, leftover.byteLength & ~1) : undefined;
  }
}

/** Buffer tiny PCM frames so the browser gets ~20ms slices, not HTTP fragments. */
export class PcmCoalescer {
  private readonly aligner = new S16leChunkAligner();
  private buffer: Uint8Array = new Uint8Array(0);
  private readonly minBytes: number;

  constructor(minBytes: number) {
    this.minBytes = Math.max(2, minBytes & ~1);
  }

  push(chunk: Uint8Array): Uint8Array[] {
    const aligned = this.aligner.push(chunk);
    if (!aligned) {
      return [];
    }
    this.buffer = concatBytes(this.buffer, aligned);
    const frames: Uint8Array[] = [];
    while (this.buffer.byteLength >= this.minBytes) {
      frames.push(this.buffer.slice(0, this.minBytes));
      this.buffer = this.buffer.slice(this.minBytes);
    }
    return frames;
  }

  flush(): Uint8Array[] {
    const tail = this.aligner.flush();
    if (tail) {
      this.buffer = concatBytes(this.buffer, tail);
    }
    if (this.buffer.byteLength === 0) {
      return [];
    }
    const out = this.buffer;
    this.buffer = new Uint8Array(0);
    return [out];
  }
}

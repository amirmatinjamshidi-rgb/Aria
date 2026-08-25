"use client";

/**
 * Plays s16le mono PCM from the gateway in the browser tab.
 *
 * HTTP/WS chunks can split a 16-bit sample, and scheduling each chunk as its
 * own AudioBufferSourceNode makes Piper sound like harsh static. This player
 * realigns samples, resamples into the device rate, and pulls from a queue on
 * the audio thread (AudioWorklet, with ScriptProcessor fallback).
 *
 * AudioContext must be unlocked from a user gesture (send / hold-to-talk).
 */
export class BrowserPcmPlayer {
  private context?: AudioContext;
  private sourceRateHz = 22050;
  private connecting?: Promise<void>;
  private leftover?: number;
  private resampler = new LinearStreamResampler();
  private pending: Float32Array[] = [];
  private worklet?: AudioWorkletNode;
  private processor?: ScriptProcessorNode;
  private scriptQueue: Float32Array[] = [];
  private scriptOffset = 0;
  private outputReady = false;
  private workletUrl?: string;

  /** Call from a click / keydown / pointerdown so later TTS is allowed to play. */
  unlock(): void {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext();
    }
    void this.context.resume();
  }

  start(sampleRateHz: number): void {
    this.unlock();
    this.sourceRateHz = sampleRateHz > 0 ? sampleRateHz : 22050;
    this.leftover = undefined;
    this.resampler.reset();
    this.pending = [];
    this.scriptQueue = [];
    this.scriptOffset = 0;
    this.worklet?.port.postMessage({ type: "clear" });
    void this.ensureOutput();
  }

  enqueue(pcm: Uint8Array): void {
    const aligned = this.takeAligned(pcm);
    if (aligned.byteLength < 2) {
      return;
    }
    const ctx = this.context;
    if (!ctx) {
      return;
    }
    const floats = this.resampler.push(
      s16leToFloat32(aligned),
      this.sourceRateHz,
      ctx.sampleRate,
    );
    if (floats.length === 0) {
      return;
    }
    if (!this.outputReady) {
      this.pending.push(floats);
      void this.ensureOutput();
      return;
    }
    this.pushSamples(floats);
  }

  stop(): void {
    this.leftover = undefined;
    this.resampler.reset();
    this.pending = [];
    this.scriptQueue = [];
    this.scriptOffset = 0;
    this.worklet?.port.postMessage({ type: "clear" });
  }

  private takeAligned(pcm: Uint8Array): Uint8Array {
    let input = pcm;
    if (this.leftover !== undefined) {
      const merged = new Uint8Array(1 + pcm.byteLength);
      merged[0] = this.leftover;
      merged.set(pcm, 1);
      input = merged;
      this.leftover = undefined;
    }
    if (input.byteLength % 2 === 1) {
      this.leftover = input[input.byteLength - 1];
      return input.subarray(0, input.byteLength - 1);
    }
    return input;
  }

  private pushSamples(samples: Float32Array): void {
    if (this.worklet) {
      this.worklet.port.postMessage({ type: "push", samples });
      return;
    }
    this.scriptQueue.push(samples);
  }

  private async ensureOutput(): Promise<void> {
    const ctx = this.context;
    if (!ctx || this.outputReady) {
      return;
    }
    this.connecting ??= this.openOutput(ctx);
    await this.connecting;
  }

  private async openOutput(ctx: AudioContext): Promise<void> {
    try {
      if (ctx.audioWorklet) {
        this.workletUrl ??= URL.createObjectURL(
          new Blob([PCM_WORKLET], { type: "text/javascript" }),
        );
        await ctx.audioWorklet.addModule(this.workletUrl);
        this.worklet = new AudioWorkletNode(ctx, "aria-pcm-player", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 1,
          channelCountMode: "explicit",
        });
        this.worklet.connect(ctx.destination);
        this.outputReady = true;
        this.flushPending();
        return;
      }
    } catch {
      this.worklet = undefined;
    }
    this.startScriptProcessor(ctx);
    this.outputReady = true;
    this.flushPending();
  }

  private flushPending(): void {
    for (const samples of this.pending) {
      this.pushSamples(samples);
    }
    this.pending = [];
  }

  private startScriptProcessor(ctx: AudioContext): void {
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    processor.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0);
      let filled = 0;
      while (filled < output.length) {
        const head = this.scriptQueue[0];
        if (!head) {
          output.fill(0, filled);
          break;
        }
        const take = Math.min(output.length - filled, head.length - this.scriptOffset);
        output.set(
          head.subarray(this.scriptOffset, this.scriptOffset + take),
          filled,
        );
        filled += take;
        this.scriptOffset += take;
        if (this.scriptOffset >= head.length) {
          this.scriptQueue.shift();
          this.scriptOffset = 0;
        }
      }
    };
    processor.connect(ctx.destination);
    this.processor = processor;
  }
}

const PCM_WORKLET = `
class AriaPcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === "clear") {
        this.queue = [];
        this.offset = 0;
        return;
      }
      if (data.type === "push" && data.samples) {
        this.queue.push(data.samples);
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0] && outputs[0][0];
    if (!output) {
      return true;
    }
    let filled = 0;
    while (filled < output.length) {
      const head = this.queue[0];
      if (!head) {
        output.fill(0, filled);
        break;
      }
      const take = Math.min(output.length - filled, head.length - this.offset);
      output.set(head.subarray(this.offset, this.offset + take), filled);
      filled += take;
      this.offset += take;
      if (this.offset >= head.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("aria-pcm-player", AriaPcmPlayer);
`;

export function decodeBase64Pcm(data: string): Uint8Array {
  const binary = atob(data);
  const pcm = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    pcm[i] = binary.charCodeAt(i);
  }
  return pcm;
}

export function s16leToFloat32(pcm: Uint8Array): Float32Array {
  const samples = Math.floor(pcm.byteLength / 2);
  const out = new Float32Array(samples);
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  for (let i = 0; i < samples; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

/**
 * Linear resample that carries phase across chunks. Restarting interpolation
 * on every HTTP/WS frame puts a click every ~20 ms — audible as crackle.
 */
export class LinearStreamResampler {
  private pending = new Float32Array(0);
  private fracPos = 0;

  reset(): void {
    this.pending = new Float32Array(0);
    this.fracPos = 0;
  }

  push(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (input.length === 0 && this.pending.length === 0) {
      return input;
    }
    const samples =
      this.pending.length === 0 ? input : concatFloat32(this.pending, input);
    this.pending = new Float32Array(0);

    if (fromRate <= 0 || toRate <= 0 || Math.abs(fromRate - toRate) < 0.5) {
      this.fracPos = 0;
      return samples;
    }

    const ratio = fromRate / toRate;
    const out: number[] = [];
    while (this.fracPos + 1 < samples.length) {
      const index = Math.floor(this.fracPos);
      const frac = this.fracPos - index;
      const a = samples[index] ?? 0;
      const b = samples[index + 1] ?? a;
      out.push(a * (1 - frac) + b * frac);
      this.fracPos += ratio;
    }
    const keepFrom = Math.min(Math.floor(this.fracPos), samples.length);
    this.pending = samples.slice(keepFrom);
    this.fracPos -= keepFrom;
    return Float32Array.from(out);
  }
}

function concatFloat32(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

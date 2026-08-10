"use client";

/**
 * Capture microphone audio, downsample to 16 kHz mono s16le, and stream chunks.
 */
export class BrowserPcmStreamer {
  private context?: AudioContext;
  private processor?: ScriptProcessorNode;
  private source?: MediaStreamAudioSourceNode;
  private stream?: MediaStream;
  private leftover = new Float32Array(0);

  constructor(
    private readonly onChunk: (pcm: Uint8Array) => void,
    private readonly chunkDurationMs = 96,
  ) {}

  async start(): Promise<void> {
    if (this.stream) {
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      this.ingest(input, this.context!.sampleRate);
    };
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  stop(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    void this.context?.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.processor = undefined;
    this.source = undefined;
    this.context = undefined;
    this.stream = undefined;
    this.leftover = new Float32Array(0);
  }

  private ingest(input: Float32Array, sampleRate: number): void {
    const merged = new Float32Array(this.leftover.length + input.length);
    merged.set(this.leftover);
    merged.set(input, this.leftover.length);

    const ratio = sampleRate / 16000;
    const outLength = Math.floor(merged.length / ratio);
    const samplesPerChunk = Math.round((16000 * this.chunkDurationMs) / 1000);
    const usable = Math.floor(outLength / samplesPerChunk) * samplesPerChunk;
    if (usable <= 0) {
      this.leftover = merged;
      return;
    }

    const pcm = new Uint8Array(usable * 2);
    const view = new DataView(pcm.buffer);
    for (let i = 0; i < usable; i += 1) {
      const srcIndex = Math.min(merged.length - 1, Math.floor(i * ratio));
      const sample = Math.max(-1, Math.min(1, merged[srcIndex] ?? 0));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    for (let offset = 0; offset < pcm.byteLength; offset += samplesPerChunk * 2) {
      this.onChunk(pcm.subarray(offset, offset + samplesPerChunk * 2));
    }

    const consumedFloats = Math.floor(usable * ratio);
    this.leftover = merged.subarray(consumedFloats);
  }
}

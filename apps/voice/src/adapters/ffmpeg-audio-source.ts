import { spawn, type ChildProcess } from "node:child_process";
import type {
  AudioChunkHandler,
  AudioFormat,
  IAudioSource,
} from "@aria/contracts";

export interface FfmpegAudioSourceOptions {
  readonly executable: string;
  readonly device: string;
  readonly sampleRateHz: 16000;
  readonly chunkDurationMs: number;
  readonly platform?: NodeJS.Platform;
}

export class FfmpegAudioSource implements IAudioSource {
  readonly format: AudioFormat;
  private process?: ChildProcess;

  constructor(private readonly options: FfmpegAudioSourceOptions) {
    this.format = {
      sampleRateHz: options.sampleRateHz,
      channels: 1,
      sampleFormat: "s16le",
    };
  }

  async start(
    handler: AudioChunkHandler,
    signal: AbortSignal,
  ): Promise<void> {
    if (this.process) {
      throw new Error("Microphone capture is already running");
    }

    const args = [
      ...this.inputArgs(),
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(this.format.sampleRateHz),
      "-f",
      "s16le",
      "pipe:1",
    ];
    const child = spawn(this.options.executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.process = child;

    const bytesPerChunk = Math.round(
      (this.format.sampleRateHz *
        2 *
        this.options.chunkDurationMs) /
        1000,
    );
    let pending = Buffer.alloc(0);
    let delivery = Promise.resolve();
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });

    child.stdout.on("data", (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= bytesPerChunk) {
        const frame = pending.subarray(0, bytesPerChunk);
        pending = pending.subarray(bytesPerChunk);
        delivery = delivery.then(() => handler(Uint8Array.from(frame)));
        delivery.catch(() => child.kill());
      }
    });

    const abort = () => child.kill();
    signal.addEventListener("abort", abort, { once: true });

    try {
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => {
          if (signal.aborted || code === 0) {
            resolve();
            return;
          }
          reject(
            new Error(
              `ffmpeg microphone capture exited with ${String(code)}: ${stderr}`,
            ),
          );
        });
      });
      await delivery;
    } finally {
      signal.removeEventListener("abort", abort);
      this.process = undefined;
    }
  }

  async stop(): Promise<void> {
    this.process?.kill();
  }

  private inputArgs(): string[] {
    const platform = this.options.platform ?? process.platform;
    switch (platform) {
      case "win32":
        return ["-f", "dshow", "-i", `audio=${this.options.device}`];
      case "darwin":
        return ["-f", "avfoundation", "-i", `:${this.options.device}`];
      case "linux":
        return ["-f", "pulse", "-i", this.options.device];
      case "aix":
      case "android":
      case "freebsd":
      case "haiku":
      case "openbsd":
      case "sunos":
      case "cygwin":
      case "netbsd":
        throw new Error(`Unsupported microphone platform: ${platform}`);
      default: {
        const _exhaustive: never = platform;
        throw new Error(`Unsupported microphone platform: ${String(_exhaustive)}`);
      }
    }
  }
}

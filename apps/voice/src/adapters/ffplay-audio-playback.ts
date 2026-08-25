import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { IAudioPlayback, PcmAudioStream } from "@aria/contracts";

function isBenignPipeError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  return code === "EPIPE" || code === "EOF" || code === "ERR_STREAM_DESTROYED";
}

export class FfplayAudioPlayback implements IAudioPlayback {
  private process?: ChildProcessWithoutNullStreams;

  constructor(private readonly executable: string) {}

  async play(
    audio: Uint8Array,
    format: { sampleRateHz: number; channels: 1 },
    signal: AbortSignal,
  ): Promise<void> {
    await this.stop();

    // FFmpeg 7+/8: use -ch_layout instead of deprecated -ac for raw PCM input.
    const channelLayout = format.channels === 1 ? "mono" : "stereo";
    const child = spawn(
      this.executable,
      [
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "error",
        "-f",
        "s16le",
        "-ar",
        String(format.sampleRateHz),
        "-ch_layout",
        channelLayout,
        "-i",
        "pipe:0",
      ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    this.process = child;
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });

    // Without this, a closed ffplay pipe emits unhandled 'error' and kills Node.
    child.stdin.on("error", (error: Error) => {
      if (signal.aborted || isBenignPipeError(error)) {
        return;
      }
    });

    const abort = (): void => {
      try {
        child.stdin.destroy();
      } catch {
        // ignore
      }
      child.kill();
    };
    signal.addEventListener("abort", abort, { once: true });

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (action: () => void): void => {
          if (settled) {
            return;
          }
          settled = true;
          action();
        };

        child.once("error", (error) => settle(() => reject(error)));
        child.once("close", (code) => {
          settle(() => {
            if (signal.aborted || code === 0 || code === null) {
              resolve();
              return;
            }
            reject(
              new Error(`ffplay exited with ${String(code)}: ${stderr}`),
            );
          });
        });

        const buffer = Buffer.from(audio);
        child.stdin.write(buffer, (writeError) => {
          if (writeError) {
            if (signal.aborted || isBenignPipeError(writeError)) {
              return;
            }
            settle(() => reject(writeError));
            return;
          }
          child.stdin.end();
        });
      });
    } finally {
      signal.removeEventListener("abort", abort);
      if (this.process === child) {
        this.process = undefined;
      }
    }
  }

  /**
   * Stream PCM into a single ffplay process. One sink for the whole turn is what
   * makes sentence pipelining sound continuous — spawning ffplay per sentence
   * adds an audible device-open gap between them.
   */
  async playStream(stream: PcmAudioStream, signal: AbortSignal): Promise<void> {
    await this.stop();

    const child = this.spawnSink(stream.sampleRateHz, stream.channels, signal);
    this.process = child;

    const abort = (): void => {
      this.destroy(child);
    };
    signal.addEventListener("abort", abort, { once: true });

    // ffplay exits once stdin closes and its buffer drains, so the process
    // lifetime — not the last write — is what "finished speaking" means.
    const exited = this.waitForExit(child, signal);

    try {
      for await (const chunk of stream.chunks) {
        if (signal.aborted || child.exitCode !== null) {
          break;
        }
        if (!(await this.write(child, chunk, signal))) {
          break;
        }
      }
      if (!signal.aborted) {
        child.stdin.end();
      }
      await exited;
    } finally {
      signal.removeEventListener("abort", abort);
      if (this.process === child) {
        this.process = undefined;
      }
    }
  }

  private spawnSink(
    sampleRateHz: number,
    channels: 1 | 2,
    signal: AbortSignal,
  ): ChildProcessWithoutNullStreams {
    const child = spawn(
      this.executable,
      [
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "error",
        "-f",
        "s16le",
        "-ar",
        String(sampleRateHz),
        "-ch_layout",
        channels === 1 ? "mono" : "stereo",
        "-i",
        "pipe:0",
      ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    child.stderr.on("data", () => {
      // Drained so ffplay never blocks on a full stderr pipe.
    });
    child.stdin.on("error", (error: Error) => {
      if (signal.aborted || isBenignPipeError(error)) {
        return;
      }
    });
    return child;
  }

  private waitForExit(
    child: ChildProcessWithoutNullStreams,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (action: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        action();
      };
      child.once("error", (error) => settle(() => reject(error)));
      child.once("close", (code) =>
        settle(() => {
          if (signal.aborted || code === 0 || code === null) {
            resolve();
            return;
          }
          reject(new Error(`ffplay exited with ${String(code)}`));
        }),
      );
    });
  }

  /** Resolves false when the pipe is gone and streaming should stop. */
  private write(
    child: ChildProcessWithoutNullStreams,
    chunk: Uint8Array,
    signal: AbortSignal,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const ok = child.stdin.write(Buffer.from(chunk), (error) => {
        if (!error) {
          return;
        }
        if (signal.aborted || isBenignPipeError(error)) {
          resolve(false);
          return;
        }
        reject(error);
      });
      if (ok) {
        resolve(true);
        return;
      }
      // Respect backpressure: ffplay's stdin buffer is small relative to a full
      // utterance, and ignoring `drain` balloons memory on long answers.
      child.stdin.once("drain", () => resolve(true));
    });
  }

  private destroy(child: ChildProcessWithoutNullStreams): void {
    try {
      child.stdin.destroy();
    } catch {
      // ignore
    }
    child.kill();
  }

  async stop(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    if (!child) {
      return;
    }
    try {
      child.stdin.destroy();
    } catch {
      // ignore
    }
    child.kill();
  }
}

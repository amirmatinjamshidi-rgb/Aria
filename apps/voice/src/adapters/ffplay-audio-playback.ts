import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { IAudioPlayback } from "@aria/contracts";

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

import { z } from "zod";
import type { InferenceSidecarClient } from "./inference-sidecar-client.js";

const CaptureResponseSchema = z.object({
  imageBase64: z.string(),
  frameId: z.string().optional(),
});

const FrameDeltaResponseSchema = z.object({
  frameId: z.string(),
  unchanged: z.boolean(),
  mse: z.number().nullish(),
  imageBase64: z.string().nullish(),
});

export interface CapturedFrame {
  readonly image: Uint8Array;
  readonly frameId?: string;
}

/**
 * Result of the cheap change probe. When `unchanged` is true there is no image:
 * the caller is expected to reuse its last scene instead of re-analyzing.
 */
export interface FrameDelta {
  readonly unchanged: boolean;
  readonly frameId: string;
  readonly mse?: number;
  readonly image?: Uint8Array;
}

export interface CameraCapture {
  capture(): Promise<CapturedFrame>;
  /**
   * Ask the sidecar whether the scene moved, getting a frame back only when it
   * did. Absent on sources that cannot diff, in which case callers must capture
   * unconditionally.
   */
  captureIfChanged?(options?: {
    readonly force?: boolean;
    readonly threshold?: number;
  }): Promise<FrameDelta>;
}

/** OpenCV webcam capture via the vision sidecar (Windows-friendly). */
export class SidecarCameraCapture implements CameraCapture {
  constructor(
    private readonly client: InferenceSidecarClient,
    private readonly deviceIndex: number,
    private readonly sessionId = "aria-vision-loop",
  ) {}

  async capture(): Promise<CapturedFrame> {
    const form = new FormData();
    form.append("device", String(this.deviceIndex));
    const captured = await this.client.postJson(
      "/v1/capture",
      form,
      CaptureResponseSchema,
    );
    return {
      image: Uint8Array.from(Buffer.from(captured.imageBase64, "base64")),
      frameId: captured.frameId,
    };
  }

  async captureIfChanged(options?: {
    readonly force?: boolean;
    readonly threshold?: number;
  }): Promise<FrameDelta> {
    const form = new FormData();
    form.append("device", String(this.deviceIndex));
    form.append("session_id", this.sessionId);
    if (options?.force === true) {
      form.append("force", "true");
    }
    if (options?.threshold !== undefined) {
      form.append("threshold", String(options.threshold));
    }

    const delta = await this.client.postJson(
      "/v1/frame/delta",
      form,
      FrameDeltaResponseSchema,
    );
    return {
      unchanged: delta.unchanged,
      frameId: delta.frameId,
      mse: delta.mse ?? undefined,
      image: delta.imageBase64
        ? Uint8Array.from(Buffer.from(delta.imageBase64, "base64"))
        : undefined,
    };
  }
}

/** Synthetic frames for mock / CI scene loops. */
export class SyntheticCameraCapture implements CameraCapture {
  private frame = 0;

  async capture(): Promise<CapturedFrame> {
    this.frame += 1;
    // Minimal JPEG SOI/EOI so the pipeline has non-empty bytes.
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    return { image: jpeg, frameId: `synthetic-${this.frame}` };
  }
}

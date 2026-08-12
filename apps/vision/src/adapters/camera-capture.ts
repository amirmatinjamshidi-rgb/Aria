import { z } from "zod";
import type { InferenceSidecarClient } from "./inference-sidecar-client.js";

const CaptureResponseSchema = z.object({
  imageBase64: z.string(),
  frameId: z.string().optional(),
});

export interface CameraCapture {
  capture(): Promise<{ image: Uint8Array; frameId?: string }>;
}

/** OpenCV webcam capture via the vision sidecar (Windows-friendly). */
export class SidecarCameraCapture implements CameraCapture {
  constructor(
    private readonly client: InferenceSidecarClient,
    private readonly deviceIndex: number,
  ) {}

  async capture(): Promise<{ image: Uint8Array; frameId?: string }> {
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
}

/** Synthetic frames for mock / CI scene loops. */
export class SyntheticCameraCapture implements CameraCapture {
  private frame = 0;

  async capture(): Promise<{ image: Uint8Array; frameId?: string }> {
    this.frame += 1;
    // Minimal JPEG SOI/EOI so the pipeline has non-empty bytes.
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    return { image: jpeg, frameId: `synthetic-${this.frame}` };
  }
}

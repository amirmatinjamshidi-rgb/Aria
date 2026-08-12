import { z } from "zod";
import {
  DetectedObjectSchema,
  type IVisionProvider,
  type PluginMetadata,
  type VisionAnalyzeOptions,
  type VisionAnalyzeResult,
} from "@aria/contracts";
import type { VisionConfig } from "../config.js";
import type { InferenceSidecarClient } from "./inference-sidecar-client.js";

const DetectResponseSchema = z.object({
  objects: z.array(DetectedObjectSchema),
  frameId: z.string().nullish(),
  mode: z.enum(["mock", "real", "live"]).nullish(),
});

const DescribeResponseSchema = z.object({
  description: z.string(),
  objects: z.array(DetectedObjectSchema).optional(),
  frameId: z.string().optional(),
});

const SegmentResponseSchema = z.object({
  objects: z.array(DetectedObjectSchema),
  frameId: z.string().optional(),
});

const CaptureResponseSchema = z.object({
  imageBase64: z.string(),
  frameId: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/**
 * Serializes VLM calls so YOLO + LLM + VLM do not fight for 8 GB VRAM (ADR-0004).
 */
class VlmQueue {
  private chain: Promise<unknown> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export class SidecarVisionProvider implements IVisionProvider {
  readonly metadata: PluginMetadata = {
    id: "sidecar-vision",
    name: "Sidecar Vision (YOLO26)",
    version: "1.0.0",
  };

  private readonly vlmQueue = new VlmQueue();

  constructor(
    private readonly client: InferenceSidecarClient,
    private readonly config: Pick<
      VisionConfig,
      | "detectModel"
      | "device"
      | "trackEnabled"
      | "vlmEnabled"
      | "segmentEnabled"
      | "confidenceThreshold"
      | "cameraDevice"
    >,
  ) {}

  async analyze(
    image: Uint8Array,
    options: VisionAnalyzeOptions = {},
  ): Promise<VisionAnalyzeResult> {
    const detect = options.detect !== false;
    const track =
      options.track === true ||
      (options.track === undefined && this.config.trackEnabled);
    const segment = options.segment === true && this.config.segmentEnabled;
    const describe = options.describe === true && this.config.vlmEnabled;

    let objects: VisionAnalyzeResult["objects"] = [];
    let frameId: string | undefined;
    let description: string | undefined;
    let source: VisionAnalyzeResult["source"];

    if (detect || track) {
      const path = track ? "/v1/track" : "/v1/detect";
      const form = this.buildImageForm(image, {
        model: this.config.detectModel,
        device: this.config.device,
        confidence: String(this.config.confidenceThreshold),
        session_id: "aria-vision",
      });
      const detected = await this.client.postJson(path, form, DetectResponseSchema);
      objects = detected.objects;
      frameId = detected.frameId ?? undefined;
      source = detected.mode === "mock" ? "mock" : "live";
    }

    if (segment) {
      const form = this.buildImageForm(image, {
        device: this.config.device,
        session_id: "aria-vision",
      });
      const segmented = await this.client.postJson(
        "/v1/segment",
        form,
        SegmentResponseSchema,
      );
      objects = mergeMaskRefs(objects, segmented.objects);
      frameId = segmented.frameId ?? frameId;
    }

    if (describe) {
      const form = this.buildImageForm(image, {
        device: this.config.device,
        session_id: "aria-vision",
      });
      const described = await this.vlmQueue.enqueue(() =>
        this.client.postJson("/v1/describe", form, DescribeResponseSchema),
      );
      description = described.description;
      if (described.objects && described.objects.length > 0 && objects.length === 0) {
        objects = described.objects;
      }
      frameId = described.frameId ?? frameId;
    } else if (options.describe === true && !this.config.vlmEnabled) {
      description =
        "Scene description is disabled to protect GPU memory (ARIA_VISION_VLM_ENABLED=false).";
    }

    return { objects, description, frameId, source };
  }

  async captureFrame(): Promise<{ image: Uint8Array; frameId?: string }> {
    const form = new FormData();
    form.append("device", String(this.config.cameraDevice));
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

  private buildImageForm(
    image: Uint8Array,
    fields: Record<string, string>,
  ): FormData {
    const form = new FormData();
    form.append(
      "image",
      new Blob([image], { type: "application/octet-stream" }),
      "frame.jpg",
    );
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    return form;
  }
}

function mergeMaskRefs(
  base: VisionAnalyzeResult["objects"],
  segmented: VisionAnalyzeResult["objects"],
): VisionAnalyzeResult["objects"] {
  if (base.length === 0) {
    return segmented;
  }
  return base.map((obj, index) => {
    const match = segmented[index];
    return match?.maskRef ? { ...obj, maskRef: match.maskRef } : obj;
  });
}

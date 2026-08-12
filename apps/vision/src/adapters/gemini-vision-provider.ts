import {
  type DetectedObject,
  type IVisionProvider,
  type PluginMetadata,
  type VisionAnalyzeOptions,
  type VisionAnalyzeResult,
} from "@aria/contracts";
import { z } from "zod";
import type { VisionConfig } from "../config.js";
import { SimpleIouTracker } from "../tracking/iou-tracker.js";

const GeminiBoxItemSchema = z.object({
  label: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  /** Gemini native format: [ymin, xmin, ymax, xmax] in 0–1000. */
  box_2d: z.array(z.number()).length(4).optional(),
  bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

const GeminiVisionJsonSchema = z.object({
  description: z.string().optional(),
  objects: z.array(GeminiBoxItemSchema).default([]),
});

class RequestQueue {
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

/**
 * Cloud CV via Gemini image understanding (free-tier friendly).
 * @see https://ai.google.dev/gemini-api/docs/image-understanding
 */
export class GeminiVisionProvider implements IVisionProvider {
  readonly metadata: PluginMetadata = {
    id: "gemini-vision",
    name: "Gemini Vision",
    version: "1.0.0",
  };

  private readonly queue = new RequestQueue();
  private readonly tracker = new SimpleIouTracker();
  private readonly apiKey: string;
  private frameCounter = 0;

  constructor(
    private readonly config: Pick<
      VisionConfig,
      | "geminiApiKey"
      | "geminiModel"
      | "geminiBaseUrl"
      | "trackEnabled"
      | "vlmEnabled"
      | "segmentEnabled"
      | "confidenceThreshold"
    >,
  ) {
    const key = config.geminiApiKey?.trim();
    if (!key) {
      throw new Error(
        "ARIA_GEMINI_API_KEY is required when ARIA_VISION_PROVIDER=gemini",
      );
    }
    this.apiKey = key;
  }

  async analyze(
    image: Uint8Array,
    options: VisionAnalyzeOptions = {},
  ): Promise<VisionAnalyzeResult> {
    const detect = options.detect !== false;
    const track =
      options.track === true ||
      (options.track === undefined && this.config.trackEnabled);
    const describe = options.describe === true && this.config.vlmEnabled;
    const segment = options.segment === true && this.config.segmentEnabled;
    this.frameCounter += 1;
    const frameId = `gemini-frame-${this.frameCounter}`;

    if (!detect && !describe && !segment) {
      return { objects: [], frameId, source: "live" };
    }

    const parsed = await this.queue.enqueue(() =>
      this.callGemini(image, { detect, describe, segment }),
    );

    let objects = parsed.objects
      .map((item, index) => toDetectedObject(item, index))
      .filter((obj) => obj.confidence >= this.config.confidenceThreshold);

    if (track) {
      objects = this.tracker.assign(objects);
    }

    if (segment) {
      objects = objects.map((obj, index) => ({
        ...obj,
        maskRef: obj.maskRef ?? `gemini-mask-${index + 1}`,
      }));
    }

    let description = parsed.description;
    if (options.describe === true && !this.config.vlmEnabled) {
      description =
        "Scene description is disabled (ARIA_VISION_VLM_ENABLED=false).";
    } else if (describe && !description) {
      description = summarizeLabels(objects);
    }

    return {
      objects,
      description,
      frameId,
      source: "live",
    };
  }

  private async callGemini(
    image: Uint8Array,
    flags: { detect: boolean; describe: boolean; segment: boolean },
  ): Promise<z.infer<typeof GeminiVisionJsonSchema>> {
    const base64 = Buffer.from(image).toString("base64");
    const mimeType = sniffMime(image);
    const prompt = buildPrompt(flags);
    const url = new URL(
      `/v1beta/models/${this.config.geminiModel}:generateContent`,
      this.config.geminiBaseUrl,
    );
    url.searchParams.set("key", this.apiKey);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        `Gemini vision failed (${response.status}): ${JSON.stringify(payload)}`,
      );
    }

    const text = extractGeminiText(payload);
    const json = extractJsonObject(text);
    return GeminiVisionJsonSchema.parse(json);
  }
}

function buildPrompt(flags: {
  detect: boolean;
  describe: boolean;
  segment: boolean;
}): string {
  const parts = [
    "You are Aria's computer vision module for a home assistant.",
    "Return ONLY valid JSON with this shape:",
    '{"description": string (optional), "objects": [{"label": string, "confidence": number 0-1, "box_2d": [ymin,xmin,ymax,xmax]}]}',
    "box_2d must be [ymin, xmin, ymax, xmax] normalized to 0-1000 (Gemini object detection format).",
    "Detect all prominent items (people, phones, cups, furniture, animals, etc.).",
  ];
  if (flags.describe) {
    parts.push(
      "Include a short natural-language description of the scene in 'description'.",
    );
  } else {
    parts.push("Omit description or set it to an empty string.");
  }
  if (flags.segment) {
    parts.push(
      "Prefer tight boxes around each object (segmentation-style crops).",
    );
  }
  if (!flags.detect && flags.describe) {
    parts.push("Focus on description; objects may be empty.");
  }
  return parts.join("\n");
}

function extractGeminiText(payload: unknown): string {
  const record = asRecord(payload);
  const candidates = record["candidates"];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("Gemini response missing candidates");
  }
  const first = asRecord(candidates[0]);
  const content = asRecord(first["content"]);
  const parts = content["parts"];
  if (!Array.isArray(parts)) {
    throw new Error("Gemini response missing content.parts");
  }
  const texts = parts
    .map((part) => {
      const p = asRecord(part);
      return typeof p["text"] === "string" ? p["text"] : "";
    })
    .filter(Boolean);
  if (texts.length === 0) {
    throw new Error("Gemini response missing text parts");
  }
  return texts.join("\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    const arrStart = trimmed.indexOf("[");
    const arrEnd = trimmed.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      const arr = JSON.parse(trimmed.slice(arrStart, arrEnd + 1)) as unknown;
      return { objects: arr };
    }
    throw new Error(`Gemini returned non-JSON: ${trimmed.slice(0, 200)}`);
  }
}

function toDetectedObject(
  item: z.infer<typeof GeminiBoxItemSchema>,
  index: number,
): DetectedObject {
  const bbox = item.bbox
    ? normalizeUnitBbox(item.bbox)
    : item.box_2d
      ? box2dToBbox(item.box_2d)
      : { x: 0, y: 0, width: 0.1, height: 0.1 };

  return {
    id: `det-${index + 1}`,
    label: item.label.trim() || "object",
    confidence: item.confidence ?? 0.85,
    bbox,
  };
}

function box2dToBbox(box: number[]): DetectedObject["bbox"] {
  const ymin = (box[0] ?? 0) / 1000;
  const xmin = (box[1] ?? 0) / 1000;
  const ymax = (box[2] ?? 0) / 1000;
  const xmax = (box[3] ?? 0) / 1000;
  return normalizeUnitBbox({
    x: xmin,
    y: ymin,
    width: Math.max(0, xmax - xmin),
    height: Math.max(0, ymax - ymin),
  });
}

function normalizeUnitBbox(bbox: DetectedObject["bbox"]): DetectedObject["bbox"] {
  return {
    x: clamp01(bbox.x),
    y: clamp01(bbox.y),
    width: clamp01(bbox.width),
    height: clamp01(bbox.height),
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function summarizeLabels(objects: readonly DetectedObject[]): string {
  if (objects.length === 0) {
    return "I do not see any notable objects.";
  }
  const counts = new Map<string, number>();
  for (const obj of objects) {
    counts.set(obj.label, (counts.get(obj.label) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([label, count]) =>
    count === 1 ? `a ${label}` : `${count} ${label}s`,
  );
  return `I see ${parts.join(", ")}.`;
}

function sniffMime(image: Uint8Array): string {
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    image.length >= 8 &&
    image[0] === 0x89 &&
    image[1] === 0x50 &&
    image[2] === 0x4e &&
    image[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    image.length >= 6 &&
    image[0] === 0x47 &&
    image[1] === 0x49 &&
    image[2] === 0x46
  ) {
    return "image/gif";
  }
  if (
    image.length >= 12 &&
    image[0] === 0x52 &&
    image[1] === 0x49 &&
    image[2] === 0x46 &&
    image[3] === 0x46
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

import { z } from "zod";

export const VisionProviderModeSchema = z.enum([
  "mock",
  "sidecar",
  "gemini",
]);
export type VisionProviderMode = z.infer<typeof VisionProviderModeSchema>;

export const VisionConfigSchema = z.object({
  provider: VisionProviderModeSchema.default("mock"),
  sidecarUrl: z.string().url().default("http://127.0.0.1:8766"),
  /** Legacy YOLO model name when provider=sidecar. */
  detectModel: z.string().default("yolo26n"),
  device: z.enum(["auto", "cpu", "cuda"]).default("auto"),
  cameraDevice: z.coerce.number().int().min(0).default(0),
  cameraEnabled: z.boolean().default(true),
  analyzeIntervalMs: z.number().int().min(100).max(60_000).default(1000),
  /** Persist trackIds (IoU for Gemini; ByteTrack for YOLO sidecar). */
  trackEnabled: z.boolean().default(true),
  /** On-demand scene description (Gemini describe / local VLM). */
  vlmEnabled: z.boolean().default(true),
  segmentEnabled: z.boolean().default(true),
  /** Face recognition is PRIVATE / opt-in only — never always-on. */
  faceRecognitionEnabled: z.boolean().default(false),
  confidenceThreshold: z.number().min(0).max(1).default(0.25),
  /**
   * When false, composition roots skip starting the continuous scene loop
   * (tools can still call IVisionProvider on demand).
   */
  enabled: z.boolean().default(true),
  /** Gemini API key (free tier). Required when provider=gemini. */
  geminiApiKey: z.string().optional(),
  /** e.g. gemini-2.0-flash (free-tier friendly). */
  geminiModel: z.string().default("gemini-2.0-flash"),
  geminiBaseUrl: z
    .string()
    .url()
    .default("https://generativelanguage.googleapis.com"),
});

export type VisionConfig = z.infer<typeof VisionConfigSchema>;

function parseBool(value: string | undefined, fallback?: boolean): boolean | undefined {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function loadVisionConfig(
  env: NodeJS.ProcessEnv = process.env,
): VisionConfig {
  return VisionConfigSchema.parse({
    provider: env["ARIA_VISION_PROVIDER"],
    sidecarUrl: env["ARIA_VISION_SIDECAR_URL"],
    detectModel: env["ARIA_VISION_DETECT_MODEL"],
    device: env["ARIA_VISION_DEVICE"],
    cameraDevice: env["ARIA_VISION_CAMERA_DEVICE"]
      ? Number(env["ARIA_VISION_CAMERA_DEVICE"])
      : undefined,
    cameraEnabled: parseBool(env["ARIA_VISION_CAMERA_ENABLED"]),
    analyzeIntervalMs: env["ARIA_VISION_ANALYZE_INTERVAL_MS"]
      ? Number(env["ARIA_VISION_ANALYZE_INTERVAL_MS"])
      : undefined,
    trackEnabled: parseBool(env["ARIA_VISION_TRACK_ENABLED"]),
    vlmEnabled: parseBool(env["ARIA_VISION_VLM_ENABLED"]),
    segmentEnabled: parseBool(env["ARIA_VISION_SEGMENT_ENABLED"]),
    faceRecognitionEnabled: parseBool(env["ARIA_VISION_FACE_ENABLED"]),
    confidenceThreshold: env["ARIA_VISION_CONFIDENCE"]
      ? Number(env["ARIA_VISION_CONFIDENCE"])
      : undefined,
    enabled: parseBool(env["ARIA_VISION_ENABLED"]),
    geminiApiKey: env["ARIA_GEMINI_API_KEY"] ?? env["GEMINI_API_KEY"],
    geminiModel: env["ARIA_GEMINI_VISION_MODEL"] ?? env["ARIA_GEMINI_MODEL"],
    geminiBaseUrl: env["ARIA_GEMINI_BASE_URL"],
  });
}

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
  /**
   * Continuous scene-loop interval. For Gemini free tier prefer ≥4500ms
   * (override with ARIA_VISION_ANALYZE_INTERVAL_MS). Sidecar/local can use 1000ms.
   */
  analyzeIntervalMs: z.number().int().min(100).max(60_000).default(4000),
  /** Persist trackIds (IoU for Gemini; ByteTrack for YOLO sidecar). */
  trackEnabled: z.boolean().default(true),
  /** On-demand scene description (Gemini describe / local VLM). */
  vlmEnabled: z.boolean().default(true),
  segmentEnabled: z.boolean().default(true),
  /** Face recognition is PRIVATE / opt-in only — never always-on. */
  faceRecognitionEnabled: z.boolean().default(false),
  confidenceThreshold: z.number().min(0).max(1).default(0.25),
  /**
   * When false, the dashboard hides Start video. The web lab never auto-starts
   * the scene loop; the user must click Start video even when this is true.
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
  /**
   * Token-bucket refill interval for Gemini calls (client-side rate limit).
   * Free tier is typically ~15 RPM; 4500ms ≈ 13 RPM, leaving headroom for the
   * on-demand vision tools that share the same budget as the scene loop.
   */
  geminiMinIntervalMs: z.number().int().min(250).max(60_000).default(4500),
  /**
   * Skip analysis entirely while the sidecar reports the frame as unchanged,
   * reusing the last stored scene. This is the main defense against burning
   * rate-limit tokens on a static desk.
   */
  frameDiffEnabled: z.boolean().default(true),
  /** MSE below this counts as an unchanged frame (see sidecars/vision). */
  frameDiffThreshold: z.number().min(0).max(255 * 255).default(12),
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
      : providerDefaultIntervalMs(env["ARIA_VISION_PROVIDER"]),
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
    geminiMinIntervalMs: env["ARIA_GEMINI_MIN_INTERVAL_MS"]
      ? Number(env["ARIA_GEMINI_MIN_INTERVAL_MS"])
      : undefined,
    frameDiffEnabled: parseBool(env["ARIA_VISION_FRAME_DIFF_ENABLED"]),
    frameDiffThreshold: env["ARIA_VISION_FRAME_DIFF_THRESHOLD"]
      ? Number(env["ARIA_VISION_FRAME_DIFF_THRESHOLD"])
      : undefined,
  });
}

function providerDefaultIntervalMs(
  provider: string | undefined,
): number | undefined {
  if (provider === "gemini") {
    return 4500;
  }
  if (provider === "sidecar") {
    return 1000;
  }
  return undefined;
}

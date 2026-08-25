import { z } from "zod";

/**
 * Runtime provider preferences — per-user, local-first.
 * Env vars remain the bootstrap defaults; this overlay lets each operator
 * pick LLM / vision / voice adapters and supply their own API keys without
 * editing service code.
 */
export const ProviderSettingsSchema = z.object({
  llmProvider: z
    .enum(["mock", "echo", "ollama", "openrouter"])
    .optional(),
  ollamaModel: z.string().min(1).optional(),
  ollamaBaseUrl: z.string().url().optional(),
  openrouterApiKey: z.string().optional(),
  openrouterModel: z.string().min(1).optional(),
  visionProvider: z.enum(["mock", "sidecar", "gemini"]).optional(),
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().min(1).optional(),
  /** Prefer local sidecars when true (ignore cloud keys for LLM/vision). */
  localFirst: z.boolean().optional(),
  ttsPersianModel: z.string().min(1).optional(),
  ttsEnglishModel: z.string().min(1).optional(),
  languageMode: z.enum(["auto", "en", "fa"]).optional(),
});

export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;

/** PATCH body — includes one-shot clear-key flags (never persisted). */
export const ProviderSettingsPatchSchema = ProviderSettingsSchema.extend({
  clearOpenrouterApiKey: z.boolean().optional(),
  clearGeminiApiKey: z.boolean().optional(),
});

export type ProviderSettingsPatch = z.infer<typeof ProviderSettingsPatchSchema>;

export const ProviderCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["llm", "vision", "stt", "tts", "search"]),
  requiresApiKey: z.boolean().default(false),
  local: z.boolean().default(true),
  description: z.string().optional(),
});

export type ProviderCatalogEntry = z.infer<typeof ProviderCatalogEntrySchema>;

/** Built-in catalog shown in the dashboard settings UI. */
export const DEFAULT_PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: "ollama",
    name: "Ollama (local)",
    kind: "llm",
    requiresApiKey: false,
    local: true,
    description: "Run Qwen / Llama locally via Ollama",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "llm",
    requiresApiKey: true,
    local: false,
    description: "Cloud multi-model gateway — bring your own key",
  },
  {
    id: "mock",
    name: "Mock LLM",
    kind: "llm",
    requiresApiKey: false,
    local: true,
    description: "Deterministic fixture replies for demos / CI",
  },
  {
    id: "echo",
    name: "Echo LLM",
    kind: "llm",
    requiresApiKey: false,
    local: true,
    description: "Mirrors the user utterance (smoke tests)",
  },
  {
    id: "gemini",
    name: "Gemini Vision",
    kind: "vision",
    requiresApiKey: true,
    local: false,
    description: "Google Gemini image understanding (free tier)",
  },
  {
    id: "sidecar",
    name: "Local YOLO sidecar",
    kind: "vision",
    requiresApiKey: false,
    local: true,
    description: "On-device detection via Python vision sidecar",
  },
  {
    id: "faster-whisper",
    name: "Faster-Whisper",
    kind: "stt",
    requiresApiKey: false,
    local: true,
    description: "Local bilingual STT with auto language detect",
  },
  {
    id: "piper",
    name: "Piper TTS",
    kind: "tts",
    requiresApiKey: false,
    local: true,
    description: "Local TTS — Lessac (en) + Ganji (fa)",
  },
];

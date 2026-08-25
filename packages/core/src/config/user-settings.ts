import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_PROVIDER_CATALOG,
  ProviderSettingsSchema,
  type ProviderCatalogEntry,
  type ProviderSettings,
} from "@aria/contracts";

export interface UserSettingsSnapshot {
  readonly providers: ProviderSettings;
  readonly catalog: readonly ProviderCatalogEntry[];
  /** Secrets never leave this process as plaintext in list responses. */
  readonly secrets: {
    readonly openrouterApiKeySet: boolean;
    readonly geminiApiKeySet: boolean;
  };
  readonly path: string;
  readonly restartRequired: boolean;
}

/**
 * Local-first per-user provider settings.
 * Stored outside the git tree so API keys are never committed.
 */
export class UserSettingsStore {
  private cache: ProviderSettings = {};

  constructor(
    private readonly filePath: string = defaultSettingsPath(),
  ) {}

  get path(): string {
    return this.filePath;
  }

  async load(): Promise<ProviderSettings> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.cache = ProviderSettingsSchema.parse(JSON.parse(raw));
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  get(): ProviderSettings {
    return this.cache;
  }

  async save(
    patch: ProviderSettings,
    options?: {
      readonly clearOpenrouterApiKey?: boolean;
      readonly clearGeminiApiKey?: boolean;
    },
  ): Promise<ProviderSettings> {
    const merged: Record<string, unknown> = {
      ...this.cache,
      ...stripUndefined(patch),
    };
    if (options?.clearOpenrouterApiKey) {
      delete merged["openrouterApiKey"];
    }
    if (options?.clearGeminiApiKey) {
      delete merged["geminiApiKey"];
    }
    const next = ProviderSettingsSchema.parse(merged);
    this.cache = next;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  snapshot(): UserSettingsSnapshot {
    const providers = this.cache;
    return {
      providers: {
        ...providers,
        openrouterApiKey: undefined,
        geminiApiKey: undefined,
      },
      catalog: DEFAULT_PROVIDER_CATALOG,
      secrets: {
        openrouterApiKeySet: Boolean(providers.openrouterApiKey?.trim()),
        geminiApiKeySet: Boolean(providers.geminiApiKey?.trim()),
      },
      path: this.filePath,
      // Hot-swap of live LLM/vision adapters lands next; settings apply on restart for now.
      restartRequired: true,
    };
  }

  /**
   * Merge user settings over process env for composition roots.
   * User keys win when present; localFirst clears cloud providers.
   */
  applyToEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const p = this.cache;
    const next: NodeJS.ProcessEnv = { ...env };

    if (p.localFirst) {
      if (!p.llmProvider || p.llmProvider === "openrouter") {
        next["ARIA_LLM_PROVIDER"] = "ollama";
      }
      if (!p.visionProvider || p.visionProvider === "gemini") {
        next["ARIA_VISION_PROVIDER"] = "sidecar";
      }
    }

    if (p.llmProvider) {
      next["ARIA_LLM_PROVIDER"] = p.llmProvider;
    }
    if (p.ollamaModel) {
      next["ARIA_OLLAMA_MODEL"] = p.ollamaModel;
    }
    if (p.ollamaBaseUrl) {
      next["ARIA_OLLAMA_URL"] = p.ollamaBaseUrl;
    }
    if (p.openrouterApiKey?.trim()) {
      next["ARIA_OPENROUTER_API_KEY"] = p.openrouterApiKey.trim();
    }
    if (p.openrouterModel) {
      next["ARIA_OPENROUTER_MODEL"] = p.openrouterModel;
    }
    if (p.visionProvider) {
      next["ARIA_VISION_PROVIDER"] = p.visionProvider;
    }
    if (p.geminiApiKey?.trim()) {
      next["ARIA_GEMINI_API_KEY"] = p.geminiApiKey.trim();
    }
    if (p.geminiModel) {
      next["ARIA_GEMINI_VISION_MODEL"] = p.geminiModel;
    }
    if (p.ttsPersianModel) {
      next["ARIA_PIPER_FA_MODEL"] = p.ttsPersianModel;
    }
    if (p.ttsEnglishModel) {
      next["ARIA_PIPER_EN_MODEL"] = p.ttsEnglishModel;
    }
    if (p.languageMode) {
      next["ARIA_LANGUAGE_MODE"] = p.languageMode;
    }
    return next;
  }
}

function stripUndefined(
  value: ProviderSettings,
): ProviderSettings {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      out[key] = entry;
    }
  }
  return out as ProviderSettings;
}

export function defaultSettingsPath(): string {
  const override = process.env["ARIA_USER_SETTINGS_PATH"];
  if (override?.trim()) {
    return path.resolve(override.trim());
  }
  const home = process.env["USERPROFILE"] ?? process.env["HOME"] ?? process.cwd();
  return path.join(home, ".aria", "user-settings.json");
}

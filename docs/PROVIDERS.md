# Dynamic Providers & API Keys

Every inference backend sits behind a **port** (`ILLMProvider`, `IVisionProvider`, `ITTSProvider`, …). Users choose adapters and supply keys **without code changes**.

## Layers of configuration (highest wins)

1. **Dashboard → Providers** → `~/.aria/user-settings.json`
2. **Environment** (`.env`, shell) — bootstrap / CI / headless
3. **Code defaults** in Zod schemas

`UserSettingsStore.applyToEnv()` merges (1) over (2) at gateway startup.

## Settings file shape

```json
{
  "llmProvider": "openrouter",
  "openrouterApiKey": "sk-or-…",
  "openrouterModel": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "visionProvider": "gemini",
  "geminiApiKey": "AIza…",
  "geminiModel": "gemini-2.0-flash",
  "localFirst": false,
  "ttsPersianModel": "models/piper/fa_IR-ganji-medium.onnx",
  "languageMode": "auto"
}
```

Path override: `ARIA_USER_SETTINGS_PATH`.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/settings/providers` | Catalog + non-secret prefs |
| `PUT`/`PATCH` | `/api/settings/providers` | Save prefs / keys |

Secrets are never returned in plaintext; responses only say whether a key is set.

## Catalog (extensible)

Defined in `@aria/contracts` as `DEFAULT_PROVIDER_CATALOG`. Adding a provider:

1. Implement the port adapter
2. Register in the service composition root
3. Add a catalog entry
4. Document env vars in `.env.example`

## Local-first flag

When `localFirst: true`, cloud LLM/vision selections fall back to Ollama + YOLO sidecar unless you explicitly force another local id.

## Roadmap

- **Now:** save settings → restart gateway to apply
- **Next:** hot-swap LLM/vision on the bus without full restart (`config.providers_updated` event)

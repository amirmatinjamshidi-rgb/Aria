"use client";

import { useEffect, useState } from "react";
import {
  gatewayHttpUrl,
  type ProviderCatalogEntry,
  type ProviderSettingsView,
} from "@/lib/types";

interface SettingsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<readonly ProviderCatalogEntry[]>([]);
  const [llmProvider, setLlmProvider] = useState("ollama");
  const [visionProvider, setVisionProvider] = useState("gemini");
  const [ollamaModel, setOllamaModel] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [openrouterModel, setOpenrouterModel] = useState("");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [ttsPersianModel, setTtsPersianModel] = useState("");
  const [ttsEnglishModel, setTtsEnglishModel] = useState("");
  const [languageMode, setLanguageMode] = useState<"auto" | "en" | "fa">("auto");
  const [localFirst, setLocalFirst] = useState(false);
  const [secrets, setSecrets] = useState({
    openrouterApiKeySet: false,
    geminiApiKeySet: false,
  });
  const [settingsPath, setSettingsPath] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`${gatewayHttpUrl()}/api/settings/providers`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load settings (${response.status})`);
        }
        return (await response.json()) as ProviderSettingsView;
      })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setCatalog(data.catalog);
        setLlmProvider(data.providers.llmProvider ?? "ollama");
        setVisionProvider(data.providers.visionProvider ?? "gemini");
        setOllamaModel(data.providers.ollamaModel ?? "");
        setOllamaBaseUrl(data.providers.ollamaBaseUrl ?? "");
        setOpenrouterModel(data.providers.openrouterModel ?? "");
        setGeminiModel(data.providers.geminiModel ?? "");
        setTtsPersianModel(data.providers.ttsPersianModel ?? "");
        setTtsEnglishModel(data.providers.ttsEnglishModel ?? "");
        setLanguageMode(data.providers.languageMode ?? "auto");
        setLocalFirst(Boolean(data.providers.localFirst));
        setSecrets(data.secrets);
        setSettingsPath(data.path);
        setOpenrouterApiKey("");
        setGeminiApiKey("");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const llmOptions = catalog.filter((entry) => entry.kind === "llm");
  const visionOptions = catalog.filter((entry) => entry.kind === "vision");

  const onSave = async (extra?: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        llmProvider,
        visionProvider,
        localFirst,
        languageMode,
        ...extra,
      };
      if (ollamaModel.trim()) {
        body.ollamaModel = ollamaModel.trim();
      }
      if (ollamaBaseUrl.trim()) {
        body.ollamaBaseUrl = ollamaBaseUrl.trim();
      }
      if (openrouterModel.trim()) {
        body.openrouterModel = openrouterModel.trim();
      }
      if (openrouterApiKey.trim()) {
        body.openrouterApiKey = openrouterApiKey.trim();
      }
      if (geminiModel.trim()) {
        body.geminiModel = geminiModel.trim();
      }
      if (geminiApiKey.trim()) {
        body.geminiApiKey = geminiApiKey.trim();
      }
      if (ttsPersianModel.trim()) {
        body.ttsPersianModel = ttsPersianModel.trim();
      }
      if (ttsEnglishModel.trim()) {
        body.ttsEnglishModel = ttsEnglishModel.trim();
      }
      const response = await fetch(`${gatewayHttpUrl()}/api/settings/providers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ProviderSettingsView & {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? `Save failed (${response.status})`);
      }
      setSecrets(data.secrets);
      setMessage(
        data.message ??
          "Saved. Restart the voice web gateway to apply provider changes.",
      );
      setOpenrouterApiKey("");
      setGeminiApiKey("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onClearKey = async (field: "openrouter" | "gemini") => {
    await onSave(
      field === "openrouter"
        ? { clearOpenrouterApiKey: true }
        : { clearGeminiApiKey: true },
    );
  };

  return (
    <div className="settings-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="settings-panel"
        role="dialog"
        aria-label="Provider settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-head">
          <h2>Providers</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="settings-lead">
          Choose your own LLM / vision / voice backends and paste API keys. Keys
          stay in <code>{settingsPath || "~/.aria/user-settings.json"}</code> —
          never in git. Restart the voice gateway after saving.
        </p>

        {loading ? <p className="settings-meta">Loading…</p> : null}
        {error ? <p className="settings-error">{error}</p> : null}
        {message ? <p className="settings-ok">{message}</p> : null}

        <label className="settings-field">
          <span>LLM provider</span>
          <select
            value={llmProvider}
            onChange={(event) => setLlmProvider(event.target.value)}
          >
            {llmOptions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        {llmProvider === "ollama" ? (
          <>
            <label className="settings-field">
              <span>Ollama model</span>
              <input
                value={ollamaModel}
                onChange={(event) => setOllamaModel(event.target.value)}
                placeholder="qwen3.5:latest"
              />
            </label>
            <label className="settings-field">
              <span>Ollama base URL</span>
              <input
                value={ollamaBaseUrl}
                onChange={(event) => setOllamaBaseUrl(event.target.value)}
                placeholder="http://127.0.0.1:11434"
              />
            </label>
          </>
        ) : null}

        {llmProvider === "openrouter" ? (
          <>
            <label className="settings-field">
              <span>
                OpenRouter API key
                {secrets.openrouterApiKeySet ? " (saved)" : ""}
              </span>
              <input
                type="password"
                autoComplete="off"
                value={openrouterApiKey}
                onChange={(event) => setOpenrouterApiKey(event.target.value)}
                placeholder={
                  secrets.openrouterApiKeySet
                    ? "•••••••• (leave blank to keep)"
                    : "sk-or-…"
                }
              />
            </label>
            {secrets.openrouterApiKeySet ? (
              <button
                type="button"
                className="ghost settings-inline"
                onClick={() => void onClearKey("openrouter")}
              >
                Clear saved OpenRouter key
              </button>
            ) : null}
            <label className="settings-field">
              <span>OpenRouter model</span>
              <input
                value={openrouterModel}
                onChange={(event) => setOpenrouterModel(event.target.value)}
                placeholder="nvidia/nemotron-3-ultra-550b-a55b:free"
              />
            </label>
          </>
        ) : null}

        <label className="settings-field">
          <span>Vision provider</span>
          <select
            value={visionProvider}
            onChange={(event) => setVisionProvider(event.target.value)}
          >
            {visionOptions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        {visionProvider === "gemini" ? (
          <>
            <label className="settings-field">
              <span>
                Gemini API key
                {secrets.geminiApiKeySet ? " (saved)" : ""}
              </span>
              <input
                type="password"
                autoComplete="off"
                value={geminiApiKey}
                onChange={(event) => setGeminiApiKey(event.target.value)}
                placeholder={
                  secrets.geminiApiKeySet
                    ? "•••••••• (leave blank to keep)"
                    : "AIza…"
                }
              />
            </label>
            {secrets.geminiApiKeySet ? (
              <button
                type="button"
                className="ghost settings-inline"
                onClick={() => void onClearKey("gemini")}
              >
                Clear saved Gemini key
              </button>
            ) : null}
            <label className="settings-field">
              <span>Gemini model</span>
              <input
                value={geminiModel}
                onChange={(event) => setGeminiModel(event.target.value)}
                placeholder="gemini-2.0-flash"
              />
            </label>
          </>
        ) : null}

        <label className="settings-field">
          <span>Language mode (STT + chat)</span>
          <select
            value={languageMode}
            onChange={(event) =>
              setLanguageMode(event.target.value as "auto" | "en" | "fa")
            }
          >
            <option value="auto">Auto detect (Persian / English)</option>
            <option value="fa">Force Persian</option>
            <option value="en">Force English</option>
          </select>
        </label>

        <label className="settings-field">
          <span>Persian TTS model (Ganji)</span>
          <input
            value={ttsPersianModel}
            onChange={(event) => setTtsPersianModel(event.target.value)}
            placeholder="models/piper/fa_IR-ganji-medium.onnx"
          />
        </label>

        <label className="settings-field">
          <span>English TTS model (Lessac)</span>
          <input
            value={ttsEnglishModel}
            onChange={(event) => setTtsEnglishModel(event.target.value)}
            placeholder="models/piper/en_US-lessac-medium.onnx"
          />
        </label>

        <label className="settings-check">
          <input
            type="checkbox"
            checked={localFirst}
            onChange={(event) => setLocalFirst(event.target.checked)}
          />
          <span>Local-first (prefer Ollama + YOLO sidecar over cloud)</span>
        </label>

        <div className="settings-actions">
          <button
            type="button"
            className="send"
            disabled={saving || loading}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save providers"}
          </button>
        </div>
      </aside>
    </div>
  );
}

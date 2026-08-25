# Aria User Guide

Test Aria’s intelligence in the **web lab** today. The same brain will later drive simulation and real robots.

## Prerequisites

- Node.js 20+
- Python 3.11+ (voice + vision sidecars)
- FFmpeg / FFplay on `PATH` (optional system mic / local playback)
- Optional: [Ollama](https://ollama.com) with a local model (e.g. `qwen3.5:latest`)
- Optional API keys: OpenRouter, Gemini (paste in **Providers** UI)

## Install

```bash
npm install
# Voice models (English Lessac + Persian Ganji)
python sidecars/voice/download_models.py
# Sidecar venvs — see sidecars/voice/README.md and sidecars/vision/README.md
```

## Run the web lab

Four processes (separate terminals):

| Command | Role |
|---------|------|
| `npm run voice:sidecar` | VAD + Whisper + Piper |
| `npm run vision:sidecar` | Webcam capture (+ optional YOLO) |
| `npm run voice:web` | Brain + voice pipeline + HTTP/WS gateway `:8787` |
| `npm run dashboard` | Next.js UI `:3000` |

Or use the helper: `pwsh scripts/start-aria-web.ps1`

Open **http://localhost:3000**.

## Talking to Aria

1. **Hold Mic** — speak; release when done. Persian and English are auto-detected.
2. **Type** — press Enter to send text.
3. Wait for the reply; if you speak again *while she is thinking*, the first answer is kept and your new line is **queued** (it will not vanish).
4. Speaking *while she is speaking* interrupts TTS (barge-in).

Headphones reduce echo until acoustic echo cancellation is added.

## Providers & API keys

Click **Providers** in the dashboard:

- LLM: `ollama` (local) / `openrouter` (bring your key) / `mock` / `echo`
- Vision: `gemini` (key) / `sidecar` (local YOLO) / `mock`
- Keys are saved under `~/.aria/user-settings.json` (never commit this file)
- After saving, **restart** `npm run voice:web` so adapters reload

See [PROVIDERS.md](PROVIDERS.md).

## Persian voice (Ganji)

Default Persian TTS model is **`fa_IR-ganji-medium`**. Language from Whisper / brain selects:

- `fa` → Ganji
- `en` → Lessac

Override with `ARIA_PIPER_FA_MODEL` or Providers → TTS paths.

## Vision

The camera stays **off** until you click **Start video** in the dashboard. That
opens the sidecar webcam, starts the live preview, and lets Aria’s vision tools
(`describe_scene`, `detect_objects`, …) grab the same captured frames.

Click **Stop video** to release the camera. Asking “what do you see?” while
video is off will tell you to start it first.

## Vision tips (avoid 429)

Gemini free tier is rate-limited. Aria now:

- Spaces Gemini calls (~4s default)
- Backs off on HTTP 429
- Keeps the last good scene during cooldown

Prefer `ARIA_VISION_PROVIDER=sidecar` for continuous local detection, and use Gemini for on-demand “what do you see?”.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Mic does nothing | Allow browser mic; or set `ARIA_AUDIO_SOURCE=browser` |
| Reply vanishes mid-turn | Fixed by utterance queue — update to latest voice pipeline |
| Vision 429 | Raise `ARIA_VISION_ANALYZE_INTERVAL_MS` / use sidecar |
| No Persian speech | Run `download_models.py`; check `models/piper/fa_IR-ganji-medium.onnx` |
| Gateway not connected | Ensure `voice:web` is running on port 8787 |
| Aria says video is off | Click **Start video** in the dashboard first |
| Reply appears but no voice | Restart `voice:sidecar` and `voice:web`, then refresh the tab (sound plays in the browser) |

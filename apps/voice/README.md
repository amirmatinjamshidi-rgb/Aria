# @aria/voice — Phase 2

Continuous, offline-first bilingual voice runtime:

```text
Microphone (FFmpeg, 16 kHz mono PCM)
  → Silero VAD (Python sidecar)
  → Faster-Whisper (Python sidecar)
  → Phase 1 brain (typed message bus)
  → Piper TTS (sidecar wraps native CLI)
  → Speaker (FFplay)
```

## Architecture

The TypeScript pipeline depends only on these `@aria/contracts` ports:

- `IAudioSource`
- `IVoiceActivityDetector`
- `ISTTProvider`
- `IMessageBus`
- `ITTSProvider`
- `IAudioPlayback`

Concrete models and audio programs are wired only in `composition-root.ts`.
Silero, Faster-Whisper, Piper, FFmpeg, or FFplay can each be replaced without
changing the state machine.

States:

```text
idle → listening → transcribing → thinking → speaking → listening
                    └──────── barge-in / cancel ────────┘
```

Microphone/VAD remain active while the agent thinks and speaks. New detected
speech aborts TTS playback immediately, ignores the stale agent reply, and
starts a new utterance. This is application-level barge-in; acoustic echo
cancellation is intentionally deferred, so use headphones during initial tests.

## Prerequisites

1. Python 3.11 (recommended) with a CUDA-compatible PyTorch install
2. FFmpeg (`ffmpeg` and `ffplay` on `PATH`)
3. Piper executable on `PATH`
4. English and Persian Piper `.onnx` model + `.onnx.json` files
5. Ollama / Phase 1 brain configured

## Install

From repository root:

```powershell
npm install
python -m venv sidecars/voice/.venv
sidecars/voice/.venv/Scripts/Activate.ps1
pip install -r sidecars/voice/requirements.txt
python sidecars/voice/download_models.py
Copy-Item apps/voice/.env.example apps/voice/.env
```

### FFmpeg (required for mic + speaker)

`ffmpeg` and `ffplay` must be on `PATH`. On Windows:

```powershell
winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
```

Close and reopen the terminal, then verify:

```powershell
ffmpeg -version
ffplay -version
```

List microphone names and put the exact string in `apps/voice/.env`:

```powershell
ffmpeg -list_devices true -f dshow -i dummy
# ARIA_MICROPHONE_DEVICE=Microphone Array (Realtek(R) Audio)
```

### CUDA PyTorch (recommended for RTX 4060)

`pip install torch` from PyPI installs a **CPU** wheel. Your driver reports CUDA 12.4
(`nvidia-smi`), so reinstall GPU wheels inside the sidecar venv:

```powershell
sidecars/voice/.venv/Scripts/Activate.ps1
pip uninstall -y torch torchaudio
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```

Expected: `True`. Then set in `apps/voice/.env`:

```env
ARIA_STT_DEVICE=cuda
ARIA_STT_COMPUTE_TYPE=float16
```

Until CUDA works, keep:

```env
ARIA_STT_DEVICE=cpu
ARIA_STT_COMPUTE_TYPE=int8
```

VAD still runs (on CPU) either way; STT will just be slower on CPU.

## Run

Copy env if needed, then start **two** terminals from `D:\Aria`:

Terminal 1 — sidecar (venv activated):

```powershell
sidecars/voice/.venv/Scripts/Activate.ps1
npm run voice:sidecar
```

Terminal 2 — TypeScript voice + brain:

```powershell
# dotenv loads apps/voice/.env when run from the workspace; prefer copying to root too:
Copy-Item apps/voice/.env.example .env -ErrorAction SilentlyContinue
npm run voice
```

### Web UI (gateway + dashboard + vision)

For the browser interaction surface (neural orb + text + optional browser mic
+ camera scene understanding). Default CV is **Gemini**
([image understanding](https://ai.google.dev/gemini-api/docs/image-understanding));
webcam capture still uses the local OpenCV sidecar.

```powershell
# Terminal A — OpenCV capture sidecar (:8766)
npm run vision:sidecar

# Terminal B — brain + voice + vision loop + HTTP/WS gateway on :8787
# Requires ARIA_GEMINI_API_KEY + ARIA_VISION_PROVIDER=gemini in apps/vision/.env
npm run voice:web

# Terminal C — Next.js UI
npm run dashboard
```

Ask “what do you see?” in the chat dock. Status line shows live scene labels.
Detection uses the **system webcam** via the vision sidecar (not the browser
camera tab permission). Get a free API key at https://aistudio.google.com/apikey.
If you see `MOCK (not camera): person, cup`, restart the vision sidecar without
`ARIA_VISION_SIDECAR_MODE=mock`. Set `ARIA_VISION_ENABLED=false` to disable the loop.

Press `Ctrl+C` for a graceful stop. Use headphones for early barge-in tests
(no acoustic echo cancellation yet).

## Performance

Every turn publishes `voice.turn_metrics` and logs:

- VAD processing time
- speech duration
- STT latency
- agent latency
- TTS latency
- time from end-of-speech to playback start
- total turn time and interruption status

The key acceptance metric is `playbackStartMs < 2000`. The medium Whisper
model is a quality-first starting point for an RTX 4060. If the LLM and STT
compete for 8 GB VRAM, try `small`, `int8_float16`, or CPU STT before guessing
at optimizations.

## Honest streaming boundary

Audio capture and VAD are genuinely streaming. Phase 2 sends each completed
VAD utterance to Faster-Whisper; Faster-Whisper is not treated as a true
incremental decoder. TTS begins after the complete agent reply. Token-to-speech
chunking can be added later behind the same ports without changing the state
machine.

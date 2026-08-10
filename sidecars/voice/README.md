# Aria Voice Inference Sidecar

One local FastAPI process owns the Python/native inference boundary:

- `POST /v1/vad` — stateful Silero VAD over 16 kHz mono PCM
- `POST /v1/vad/reset` — reset a microphone session
- `POST /v1/transcribe` — Faster-Whisper utterance transcription
- `POST /v1/synthesize` — Piper raw PCM synthesis
- `GET /health` — process liveness

Models load lazily. Faster-Whisper instances are cached by
`(model, device, compute_type)`. Piper voice models remain replaceable request
parameters selected by the TypeScript adapter.

Run from repository root:

```powershell
python -m uvicorn app.main:app --app-dir sidecars/voice --host 127.0.0.1 --port 8765
```

The service binds to loopback by default and should not be exposed publicly.

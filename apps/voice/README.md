# @aria/voice (Phase 2)

Speech pipeline orchestration: Silero VAD → Faster-Whisper STT → bus → Piper TTS.

Depends only on `@aria/contracts` ports (`ISTTProvider`, `ITTSProvider`, `IMessageBus`).
Python inference lives in `sidecars/whisper` and `sidecars/piper`.

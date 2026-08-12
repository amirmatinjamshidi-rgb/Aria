# Python inference sidecars

Thin HTTP/WebSocket servers for ML inference. **No business logic here.**

| Sidecar | Phase | Model |
|---------|-------|-------|
| `voice/` | 2 | Silero VAD + Faster-Whisper + Piper (one process) |
| `vision/` | 4 | OpenCV capture (+ optional YOLO26/SAM2/MediaPipe/Qwen-VL) |

Default Phase 4 **detection/describe** uses the **Gemini API** from TypeScript
(`ARIA_VISION_PROVIDER=gemini`). The vision sidecar still supplies webcam frames.

TypeScript apps consume these via port adapters in `@aria/contracts`.

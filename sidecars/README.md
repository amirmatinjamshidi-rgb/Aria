# Python inference sidecars

Thin HTTP/WebSocket servers for ML inference. **No business logic here.**

| Sidecar | Phase | Model |
|---------|-------|-------|
| `whisper/` | 2 | Faster-Whisper |
| `piper/` | 2 | Piper TTS |
| `yolo/` | 4 | YOLO11 |
| `sam2/` | 4 | SAM2 |
| `mediapipe/` | 4 | MediaPipe |
| `qwen-vl/` | 4 | Qwen2.5-VL |

TypeScript apps consume these via port adapters in `@aria/contracts`.

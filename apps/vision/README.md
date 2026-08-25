# @aria/vision (Phase 4)

Perception orchestration implementing `IVisionProvider`.

## Providers

| `ARIA_VISION_PROVIDER` | Behavior |
|------------------------|----------|
| `gemini` (**recommended**) | [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) for detect/describe (free tier) |
| `sidecar` | Local YOLO26 + optional SAM2/VLM in `sidecars/vision` |
| `mock` | Deterministic fixtures for CI |

Webcam capture stays local via the OpenCV sidecar (`POST /v1/capture`) even when
detection uses Gemini. Tracking for Gemini uses IoU label matching in TypeScript.

## Gemini setup (free tier)

1. Create an API key: https://aistudio.google.com/apikey  
2. Put it in `apps/vision/.env`:

```env
ARIA_GEMINI_API_KEY=your_key_here
ARIA_GEMINI_VISION_MODEL=gemini-2.0-flash
ARIA_VISION_PROVIDER=gemini
ARIA_VISION_ANALYZE_INTERVAL_MS=4500
ARIA_GEMINI_MIN_INTERVAL_MS=4500
```

## Run (browser)

```powershell
# Terminal A — capture sidecar only (OpenCV webcam)
npm run vision:sidecar

# Terminal B — voice + vision gateway
npm run voice:web

# Terminal C — dashboard
npm run dashboard
```

Ask “what do you see?” / “detect objects”. Preview polls live frames; Gemini
analyze runs on the configured loop (≥4500ms / token bucket — see ADR-0013).
Unchanged camera frames skip Gemini entirely.

## Local YOLO fallback

```env
ARIA_VISION_PROVIDER=sidecar
ARIA_VISION_DETECT_MODEL=yolo26n
```

See `sidecars/vision/README.md` for weights download.

## VRAM (ADR-0004)

Gemini path uses almost no local GPU for CV. For sidecar YOLO + local LLM on an
RTX 4060 8 GB, follow the degradation ladder (drop heavy VLM first).

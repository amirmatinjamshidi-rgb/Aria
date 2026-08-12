# Aria Vision Inference Sidecar

Thin FastAPI process for **local** vision I/O and optional YOLO:

| Route | Role |
|-------|------|
| `GET /health` | Process liveness (`mode`: real \| mock) |
| `POST /v1/capture` | OpenCV webcam JPEG (used by Gemini + YOLO paths) |
| `POST /v1/detect` | YOLO26 (only when `ARIA_VISION_PROVIDER=sidecar`) |
| `POST /v1/track` | YOLO26 + ByteTrack |
| `POST /v1/pose` | MediaPipe pose |
| `POST /v1/segment` | SAM2 on demand |
| `POST /v1/describe` | Local Qwen2.5-VL on demand |

**Default Aria CV is Gemini API** (`ARIA_VISION_PROVIDER=gemini`) — see
`apps/vision/README.md` and
[Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding).
With Gemini you still run this sidecar for **webcam capture only**.

## Setup (Windows PowerShell)

```powershell
cd sidecars/vision
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Optional if using YOLO sidecar provider:
# python download_models.py
```

## Run

From repository root:

```powershell
npm run vision:sidecar
```

Mock capture (no webcam):

```powershell
$env:ARIA_VISION_SIDECAR_MODE = "mock"
npm run vision:sidecar
```

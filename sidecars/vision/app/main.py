from __future__ import annotations

import asyncio
import base64
import os
import uuid
from dataclasses import dataclass
from io import BytesIO
from threading import Lock
from typing import Annotated, Any

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from .frame_diff import DEFAULT_MSE_THRESHOLD, FrameDelta, FrameDiffer

app = FastAPI(title="Aria Vision Inference", version="1.0.0")

# Frames handed to a remote VLM: 1080p keeps small on-screen text legible while
# q75 keeps the upload well under a megabyte.
SNAPSHOT_MAX_HEIGHT = 1080
SNAPSHOT_JPEG_QUALITY = 75

# mock | real — mock skips heavy model loads for CI / first boot
SIDECAR_MODE = os.environ.get("ARIA_VISION_SIDECAR_MODE", "real").strip().lower()
BIND_HOST = os.environ.get("ARIA_VISION_SIDECAR_HOST", "127.0.0.1")

if SIDECAR_MODE == "mock":
    print(
        "[aria-vision] WARNING: SIDECAR_MODE=mock — fake person/cup, webcam disabled",
        flush=True,
    )
else:
    print(f"[aria-vision] SIDECAR_MODE={SIDECAR_MODE} — real camera + YOLO", flush=True)


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    def model_dump(self, **kwargs: Any) -> dict[str, Any]:
        kwargs.setdefault("by_alias", True)
        kwargs.setdefault("exclude_none", True)
        return super().model_dump(**kwargs)


class BBox(CamelModel):
    x: float
    y: float
    width: float
    height: float


class DetectedObject(CamelModel):
    id: str
    label: str
    confidence: float
    bbox: BBox
    track_id: str | None = Field(default=None, alias="trackId")
    mask_ref: str | None = Field(default=None, alias="maskRef")


class DetectResponse(CamelModel):
    objects: list[DetectedObject]
    frame_id: str | None = Field(default=None, alias="frameId")
    mode: str | None = None


class DescribeResponse(CamelModel):
    description: str
    objects: list[DetectedObject] | None = None
    frame_id: str | None = Field(default=None, alias="frameId")


class CaptureResponse(CamelModel):
    image_base64: str = Field(alias="imageBase64")
    frame_id: str | None = Field(default=None, alias="frameId")
    width: int | None = None
    height: int | None = None


class PoseKeypoint(CamelModel):
    name: str
    x: float
    y: float
    visibility: float | None = None


class PoseResponse(CamelModel):
    poses: list[list[PoseKeypoint]]
    frame_id: str | None = Field(default=None, alias="frameId")


class FrameDeltaResponse(CamelModel):
    frame_id: str = Field(alias="frameId")
    #: True when the scene matches the previous frame closely enough to reuse
    #: the last vision result instead of running the models again.
    unchanged: bool
    #: Mean squared error against the previous frame; null for the first frame.
    mse: float | None = None
    threshold: float
    width: int | None = None
    height: int | None = None
    #: Present only when the frame changed (or `force` was set).
    image_base64: str | None = Field(default=None, alias="imageBase64")


@dataclass
class CameraState:
    capture: cv2.VideoCapture | None = None
    device_index: int | None = None


class ModelHub:
    """Lazy model loader. Never keeps VLM + detector hot unless requested."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._yolo: dict[str, Any] = {}
        self._sam: Any | None = None
        self._vlm: Any | None = None
        self._vlm_processor: Any | None = None
        self._pose: Any | None = None
        self._vlm_lock = Lock()
        self._camera = CameraState()

    def yolo(self, name: str, device: str):
        from ultralytics import YOLO

        key = f"{name}:{device}"
        with self._lock:
            if key not in self._yolo:
                weights = name if name.endswith(".pt") else f"{name}.pt"
                model = YOLO(weights)
                self._yolo[key] = model
            return self._yolo[key]

    def sam(self):
        from ultralytics import SAM

        with self._lock:
            if self._sam is None:
                # SAM2 tiny — on demand only
                self._sam = SAM("sam2_t.pt")
            return self._sam

    def pose(self):
        import mediapipe as mp

        with self._lock:
            if self._pose is None:
                self._pose = mp.solutions.pose.Pose(
                    static_image_mode=True,
                    model_complexity=0,
                )
            return self._pose

    def vlm(self):
        """Qwen2.5-VL quantized — loaded only when /v1/describe is called."""
        with self._lock:
            if self._vlm is None:
                try:
                    from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
                    import torch

                    model_id = os.environ.get(
                        "ARIA_VISION_VLM_MODEL",
                        "Qwen/Qwen2.5-VL-3B-Instruct",
                    )
                    self._vlm_processor = AutoProcessor.from_pretrained(model_id)
                    dtype = (
                        torch.float16 if torch.cuda.is_available() else torch.float32
                    )
                    self._vlm = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                        model_id,
                        torch_dtype=dtype,
                        device_map="auto" if torch.cuda.is_available() else None,
                    )
                except Exception as error:  # noqa: BLE001
                    raise RuntimeError(
                        f"Failed to load VLM ({error}). "
                        "Set ARIA_VISION_SIDECAR_MODE=mock or install transformers + model."
                    ) from error
            return self._vlm, self._vlm_processor


hub = ModelHub()
differ = FrameDiffer()


def _decode_image(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image bytes")
    return image


def _encode_jpeg(
    image: np.ndarray,
    *,
    max_width: int = 640,
    max_height: int | None = None,
    quality: int = 65,
) -> bytes:
    """Downscale + compress so dashboard preview stays light."""
    frame = image
    height, width = frame.shape[:2]
    if width > max_width > 0:
        scale = max_width / float(width)
        frame = cv2.resize(
            frame,
            (max_width, max(1, int(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    height, width = frame.shape[:2]
    if max_height is not None and height > max_height > 0:
        scale = max_height / float(height)
        frame = cv2.resize(
            frame,
            (max(1, int(width * scale)), max_height),
            interpolation=cv2.INTER_AREA,
        )
    ok, buf = cv2.imencode(
        ".jpg",
        frame,
        [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)],
    )
    if not ok:
        raise ValueError("Could not encode JPEG")
    return buf.tobytes()


def _xyxy_to_norm(xyxy: list[float], width: int, height: int) -> BBox:
    x1, y1, x2, y2 = xyxy
    return BBox(
        x=max(0.0, float(x1) / width),
        y=max(0.0, float(y1) / height),
        width=max(0.0, float(x2 - x1) / width),
        height=max(0.0, float(y2 - y1) / height),
    )


def _mock_objects(track: bool) -> list[DetectedObject]:
    objects = [
        DetectedObject(
            id="det-1",
            label="person",
            confidence=0.91,
            bbox=BBox(x=0.2, y=0.15, width=0.25, height=0.6),
            trackId="track-1" if track else None,
        ),
        DetectedObject(
            id="det-2",
            label="cup",
            confidence=0.84,
            bbox=BBox(x=0.55, y=0.55, width=0.12, height=0.18),
            trackId="track-2" if track else None,
        ),
    ]
    return objects


def _results_to_objects(result: Any, track: bool) -> list[DetectedObject]:
    objects: list[DetectedObject] = []
    if result.boxes is None:
        return objects
    height, width = result.orig_shape
    names = result.names or {}
    boxes = result.boxes
    for index in range(len(boxes)):
        xyxy = boxes.xyxy[index].tolist()
        conf = float(boxes.conf[index].item())
        cls_id = int(boxes.cls[index].item())
        label = str(names.get(cls_id, cls_id))
        track_id = None
        if track and boxes.id is not None:
            tid = boxes.id[index]
            if tid is not None:
                track_id = f"track-{int(tid.item())}"
        objects.append(
            DetectedObject(
                id=f"det-{index + 1}",
                label=label,
                confidence=conf,
                bbox=_xyxy_to_norm(xyxy, width, height),
                trackId=track_id,
            )
        )
    return objects


async def _read_image(image: UploadFile) -> np.ndarray:
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image")
    try:
        return await asyncio.to_thread(_decode_image, data)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "mode": SIDECAR_MODE}


def _open_camera(device: int) -> cv2.VideoCapture:
    """Open a webcam with Windows-friendly backends and a short warmup."""
    candidates: list[cv2.VideoCapture] = []
    dshow = getattr(cv2, "CAP_DSHOW", None)
    msfmf = getattr(cv2, "CAP_MSMF", None)
    if dshow is not None:
        candidates.append(cv2.VideoCapture(device, dshow))
    if msfmf is not None:
        candidates.append(cv2.VideoCapture(device, msfmf))
    candidates.append(cv2.VideoCapture(device))

    capture: cv2.VideoCapture | None = None
    for candidate in candidates:
        if candidate is not None and candidate.isOpened():
            capture = candidate
            break
        if candidate is not None:
            candidate.release()

    if capture is None or not capture.isOpened():
        raise RuntimeError(
            f"Cannot open camera device {device}. "
            "Try ARIA_VISION_CAMERA_DEVICE=1 (or another index) and close other apps using the webcam."
        )

    # DirectShow often returns an empty first frame.
    for _ in range(5):
        capture.read()
    return capture


def _read_camera_frame(device: int) -> np.ndarray:
    """Grab one BGR frame, reopening the device once on a transient failure."""
    with hub._lock:
        cam = hub._camera
        if cam.capture is None or cam.device_index != device:
            if cam.capture is not None:
                cam.capture.release()
            cam.capture = _open_camera(device)
            cam.device_index = device
        ok, frame = cam.capture.read()
        if not ok or frame is None:
            cam.capture.release()
            cam.capture = _open_camera(device)
            ok, frame = cam.capture.read()
        if not ok or frame is None:
            raise RuntimeError("Camera read failed")
        return frame


@app.post("/v1/detect", response_model=DetectResponse, response_model_by_alias=True)
async def detect(
    image: Annotated[UploadFile, File()],
    model: Annotated[str, Form()] = "yolo26n",
    device: Annotated[str, Form()] = "auto",
    confidence: Annotated[float, Form()] = 0.25,
    session_id: Annotated[str, Form()] = "aria-vision",
) -> DetectResponse:
    _ = session_id
    frame_id = str(uuid.uuid4())
    if SIDECAR_MODE == "mock":
        return DetectResponse(
            objects=_mock_objects(track=False), frameId=frame_id, mode=SIDECAR_MODE
        )

    bgr = await _read_image(image)

    def run() -> list[DetectedObject]:
        yolo = hub.yolo(model, device)
        results = yolo.predict(
            source=bgr,
            conf=confidence,
            verbose=False,
            device=None if device == "auto" else device,
        )
        return _results_to_objects(results[0], track=False)

    objects = await asyncio.to_thread(run)
    return DetectResponse(objects=objects, frameId=frame_id, mode=SIDECAR_MODE)


@app.post("/v1/track", response_model=DetectResponse, response_model_by_alias=True)
async def track(
    image: Annotated[UploadFile, File()],
    model: Annotated[str, Form()] = "yolo26n",
    device: Annotated[str, Form()] = "auto",
    confidence: Annotated[float, Form()] = 0.25,
    session_id: Annotated[str, Form()] = "aria-vision",
) -> DetectResponse:
    frame_id = str(uuid.uuid4())
    if SIDECAR_MODE == "mock":
        return DetectResponse(
            objects=_mock_objects(track=True), frameId=frame_id, mode=SIDECAR_MODE
        )

    bgr = await _read_image(image)

    def run() -> list[DetectedObject]:
        yolo = hub.yolo(model, device)
        # persist=True keeps ByteTrack state server-side for the process
        results = yolo.track(
            source=bgr,
            conf=confidence,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False,
            device=None if device == "auto" else device,
        )
        return _results_to_objects(results[0], track=True)

    objects = await asyncio.to_thread(run)
    return DetectResponse(objects=objects, frameId=frame_id, mode=SIDECAR_MODE)


@app.post("/v1/pose", response_model=PoseResponse, response_model_by_alias=True)
async def pose(
    image: Annotated[UploadFile, File()],
    session_id: Annotated[str, Form()] = "aria-vision",
) -> PoseResponse:
    _ = session_id
    frame_id = str(uuid.uuid4())
    if SIDECAR_MODE == "mock":
        return PoseResponse(
            poses=[
                [
                    PoseKeypoint(name="nose", x=0.5, y=0.2, visibility=0.99),
                    PoseKeypoint(name="left_shoulder", x=0.4, y=0.35, visibility=0.9),
                    PoseKeypoint(name="right_shoulder", x=0.6, y=0.35, visibility=0.9),
                ]
            ],
            frameId=frame_id,
        )

    bgr = await _read_image(image)

    def run() -> list[list[PoseKeypoint]]:
        import mediapipe as mp

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        result = hub.pose().process(rgb)
        if not result.pose_landmarks:
            return []
        landmarks = []
        for idx, lm in enumerate(result.pose_landmarks.landmark):
            name = mp.solutions.pose.PoseLandmark(idx).name.lower()
            landmarks.append(
                PoseKeypoint(
                    name=name,
                    x=float(lm.x),
                    y=float(lm.y),
                    visibility=float(lm.visibility),
                )
            )
        return [landmarks]

    poses = await asyncio.to_thread(run)
    return PoseResponse(poses=poses, frameId=frame_id)


@app.post("/v1/segment", response_model=DetectResponse, response_model_by_alias=True)
async def segment(
    image: Annotated[UploadFile, File()],
    device: Annotated[str, Form()] = "auto",
    session_id: Annotated[str, Form()] = "aria-vision",
) -> DetectResponse:
    _ = device
    _ = session_id
    frame_id = str(uuid.uuid4())
    if SIDECAR_MODE == "mock":
        objs = [
            DetectedObject(
                id=obj.id,
                label=obj.label,
                confidence=obj.confidence,
                bbox=obj.bbox,
                trackId=obj.track_id,
                maskRef=f"mask-{index + 1}",
            )
            for index, obj in enumerate(_mock_objects(track=False))
        ]
        return DetectResponse(objects=objs, frameId=frame_id, mode=SIDECAR_MODE)

    bgr = await _read_image(image)

    def run() -> list[DetectedObject]:
        sam = hub.sam()
        results = sam.predict(source=bgr, verbose=False)
        objects: list[DetectedObject] = []
        result = results[0]
        height, width = result.orig_shape
        if result.boxes is None:
            return objects
        for index in range(len(result.boxes)):
            xyxy = result.boxes.xyxy[index].tolist()
            conf = (
                float(result.boxes.conf[index].item())
                if result.boxes.conf is not None
                else 0.5
            )
            objects.append(
                DetectedObject(
                    id=f"seg-{index + 1}",
                    label="segment",
                    confidence=conf,
                    bbox=_xyxy_to_norm(xyxy, width, height),
                    maskRef=f"mask-{index + 1}",
                )
            )
        return objects

    objects = await asyncio.to_thread(run)
    return DetectResponse(objects=objects, frameId=frame_id, mode=SIDECAR_MODE)


@app.post(
    "/v1/describe",
    response_model=DescribeResponse,
    response_model_by_alias=True,
)
async def describe(
    image: Annotated[UploadFile, File()],
    device: Annotated[str, Form()] = "auto",
    session_id: Annotated[str, Form()] = "aria-vision",
) -> DescribeResponse:
    _ = device
    _ = session_id
    frame_id = str(uuid.uuid4())
    if SIDECAR_MODE == "mock":
        return DescribeResponse(
            description="I see a person and a cup on a table.",
            objects=_mock_objects(track=True),
            frameId=frame_id,
        )

    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image")

    def run() -> str:
        # Sequential GPU use — callers should also queue (ADR-0004).
        with hub._vlm_lock:
            model, processor = hub.vlm()
            from PIL import Image

            pil = Image.open(BytesIO(data)).convert("RGB")
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": pil},
                        {
                            "type": "text",
                            "text": "Describe what you see briefly for a home assistant.",
                        },
                    ],
                }
            ]
            text = processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
            inputs = processor(
                text=[text],
                images=[pil],
                return_tensors="pt",
                padding=True,
            )
            inputs = inputs.to(model.device)
            output = model.generate(**inputs, max_new_tokens=128)
            trimmed = [
                out[len(inp) :] for inp, out in zip(inputs.input_ids, output)
            ]
            return processor.batch_decode(
                trimmed,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            )[0].strip()

    try:
        description = await asyncio.to_thread(run)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return DescribeResponse(description=description, frameId=frame_id)


@app.post(
    "/v1/capture",
    response_model=CaptureResponse,
    response_model_by_alias=True,
)
async def capture(
    device: Annotated[int, Form()] = 0,
) -> CaptureResponse:
    frame_id = str(uuid.uuid4())
    if SIDECAR_MODE == "mock":
        # 1x1 black JPEG
        black = np.zeros((64, 64, 3), dtype=np.uint8)
        jpeg = _encode_jpeg(black)
        return CaptureResponse(
            imageBase64=base64.b64encode(jpeg).decode("ascii"),
            frameId=frame_id,
            width=64,
            height=64,
        )

    def run() -> tuple[bytes, int, int]:
        frame = _read_camera_frame(device)
        height, width = frame.shape[:2]
        return _encode_jpeg(frame), width, height

    try:
        jpeg, width, height = await asyncio.to_thread(run)
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return CaptureResponse(
        imageBase64=base64.b64encode(jpeg).decode("ascii"),
        frameId=frame_id,
        width=width,
        height=height,
    )


@app.post(
    "/v1/frame/delta",
    response_model=FrameDeltaResponse,
    response_model_by_alias=True,
)
async def frame_delta(
    device: Annotated[int, Form()] = 0,
    session_id: Annotated[str, Form()] = "aria-vision",
    threshold: Annotated[float, Form()] = DEFAULT_MSE_THRESHOLD,
    force: Annotated[bool, Form()] = False,
) -> FrameDeltaResponse:
    """Report whether the scene moved, and return a frame only when it did.

    This is the gate in front of every expensive vision path: callers poll it
    cheaply and skip Gemini / YOLO entirely while `unchanged` is true. Pass
    `force=true` for an explicit vision tool request, which must always get a
    frame back regardless of motion.

    Image bytes are never accepted here — the Node client only sends form
    fields, and mixing an optional `File` with `Form` is what crashed startup.
    """
    frame_id = str(uuid.uuid4())

    if SIDECAR_MODE == "mock":
        # Deterministic for tests: a mock camera never moves after frame one.
        delta = differ.compare(session_id, np.zeros((480, 640, 3), np.uint8), threshold)
        include = force or delta.changed
        black = np.zeros((64, 64, 3), dtype=np.uint8)
        return FrameDeltaResponse(
            frameId=frame_id,
            unchanged=not delta.changed,
            mse=None if delta.first_frame else delta.mse,
            threshold=threshold,
            width=64 if include else None,
            height=64 if include else None,
            imageBase64=(
                base64.b64encode(_encode_jpeg(black)).decode("ascii")
                if include
                else None
            ),
        )

    def run() -> tuple[FrameDelta, bytes | None, int, int]:
        frame = _read_camera_frame(device)
        delta = differ.compare(session_id, frame, threshold)
        height, width = frame.shape[:2]
        if not (force or delta.changed):
            # The caller already has an equivalent frame; sending ~200 KB of
            # JPEG it will throw away is the thing this endpoint exists to avoid.
            return delta, None, width, height
        jpeg = _encode_jpeg(
            frame,
            max_width=0,
            max_height=SNAPSHOT_MAX_HEIGHT,
            quality=SNAPSHOT_JPEG_QUALITY,
        )
        return delta, jpeg, width, height

    try:
        delta, jpeg, width, height = await asyncio.to_thread(run)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return FrameDeltaResponse(
        frameId=frame_id,
        unchanged=not delta.changed,
        mse=None if delta.first_frame else delta.mse,
        threshold=threshold,
        width=width if jpeg is not None else None,
        height=height if jpeg is not None else None,
        imageBase64=(
            base64.b64encode(jpeg).decode("ascii") if jpeg is not None else None
        ),
    )


@app.post("/v1/frame/delta/reset")
async def reset_frame_delta(
    session_id: Annotated[str, Form()] = "aria-vision",
) -> dict[str, bool]:
    """Drop the baseline so the next frame is reported as changed."""
    differ.reset(session_id)
    return {"ok": True}

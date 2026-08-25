from __future__ import annotations

import asyncio
import base64
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from threading import Lock
from typing import Annotated, Literal

import numpy as np
import torch
from fastapi import Body, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from silero_vad import load_silero_vad

from .piper_engine import PiperEngine

app = FastAPI(title="Aria Voice Inference", version="1.0.0")

# End-of-speech hangover. Silero frames are 32 ms, so 288 ms is 9 whole frames —
# long enough to ride out inter-word gaps, short enough that the turn does not
# feel padded. The client's matching pre-roll keeps the first syllable intact.
DEFAULT_MIN_SILENCE_MS = 288


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class VadResponse(CamelModel):
    probability: float
    speech_started: bool = Field(alias="speechStarted")
    speech_ended: bool = Field(alias="speechEnded")


class ResetRequest(CamelModel):
    session_id: str = Field(alias="sessionId")


class TranscriptionResponse(CamelModel):
    text: str
    language: Literal["en", "fa"]
    language_probability: float | None = Field(
        default=None, alias="languageProbability"
    )
    duration_ms: float = Field(alias="durationMs")
    inference_ms: float = Field(alias="inferenceMs")


class SynthesisRequest(CamelModel):
    text: str
    model: str
    executable: str = "piper"
    speaking_rate: float | None = Field(default=None, alias="speakingRate")
    language: Literal["en", "fa"] | None = None


class SynthesisResponse(CamelModel):
    audio_base64: str = Field(alias="audioBase64")
    sample_rate_hz: int = Field(alias="sampleRateHz")


@dataclass
class VadSession:
    triggered: bool = False
    silence_ms: float = 0.0


class SileroEngine:
    """Stateful, single-microphone streaming Silero VAD engine."""

    def __init__(self) -> None:
        self._model = None
        self._session_id: str | None = None
        self._session = VadSession()
        self._lock = Lock()

    def _ensure_model(self):
        if self._model is None:
            self._model = load_silero_vad()
            self._model.reset_states()
        return self._model

    def process(
        self,
        session_id: str,
        pcm: bytes,
        sample_rate: int,
        threshold: float,
        min_silence_ms: int,
    ) -> VadResponse:
        if sample_rate != 16000:
            raise ValueError("Silero stream requires 16 kHz mono PCM")
        samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        if samples.size == 0:
            return VadResponse(
                probability=0.0, speechStarted=False, speechEnded=False
            )

        with self._lock:
            model = self._ensure_model()
            if self._session_id != session_id:
                model.reset_states()
                self._session_id = session_id
                self._session = VadSession()

            probabilities: list[float] = []
            speech_started = False
            speech_ended = False
            # Silero's 16 kHz streaming window is 512 samples (32 ms).
            for offset in range(0, samples.size, 512):
                window = samples[offset : offset + 512]
                if window.size < 512:
                    window = np.pad(window, (0, 512 - window.size))
                probability = float(
                    model(torch.from_numpy(window), sample_rate).item()
                )
                probabilities.append(probability)
                frame_ms = 32.0

                if not self._session.triggered and probability >= threshold:
                    self._session.triggered = True
                    self._session.silence_ms = 0.0
                    speech_started = True
                elif self._session.triggered:
                    if probability < max(0.0, threshold - 0.15):
                        self._session.silence_ms += frame_ms
                        if self._session.silence_ms >= min_silence_ms:
                            self._session.triggered = False
                            self._session.silence_ms = 0.0
                            speech_ended = True
                            model.reset_states()
                    else:
                        self._session.silence_ms = 0.0

        return VadResponse(
            probability=max(probabilities, default=0.0),
            speechStarted=speech_started,
            speechEnded=speech_ended,
        )

    def reset(self, session_id: str) -> None:
        with self._lock:
            if self._model is not None:
                self._model.reset_states()
            self._session_id = session_id
            self._session = VadSession()


class WhisperModels:
    """CTranslate2 Whisper models, cached per (name, device, compute type).

    CUDA is preferred with `float16`. A GPU that advertises itself through torch
    can still fail to load CTranslate2 (missing cuDNN, exhausted VRAM), so a
    failed CUDA load is retried once on CPU with `int8` rather than taking the
    whole turn down.
    """

    def __init__(self) -> None:
        self._models: dict[tuple[str, str, str], object] = {}
        self._lock = Lock()

    @staticmethod
    def _resolve(device: str, compute_type: str) -> tuple[str, str]:
        resolved_device = device
        if resolved_device == "auto":
            resolved_device = "cuda" if torch.cuda.is_available() else "cpu"
        resolved_compute = compute_type
        if resolved_device == "cpu" and compute_type in {"float16", "int8_float16"}:
            resolved_compute = "int8"
        return resolved_device, resolved_compute

    def get(self, name: str, device: str, compute_type: str):
        resolved_device, resolved_compute = self._resolve(device, compute_type)

        with self._lock:
            key = (name, resolved_device, resolved_compute)
            cached = self._models.get(key)
            if cached is not None:
                return cached

            try:
                model = self._load(name, resolved_device, resolved_compute)
            except Exception as error:
                if resolved_device != "cuda":
                    raise
                print(
                    f"[aria-voice] Whisper CUDA load failed ({error!s}); "
                    "falling back to CPU int8",
                    flush=True,
                )
                key = (name, "cpu", "int8")
                cached = self._models.get(key)
                if cached is not None:
                    return cached
                model = self._load(name, "cpu", "int8")

            self._models[key] = model
            return model

    @staticmethod
    def _load(name: str, device: str, compute_type: str):
        from faster_whisper import WhisperModel

        print(
            f"[aria-voice] loading Whisper {name} device={device} "
            f"compute={compute_type}",
            flush=True,
        )
        return WhisperModel(name, device=device, compute_type=compute_type)


vad_engine = SileroEngine()
whisper_models = WhisperModels()
piper_engine = PiperEngine()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/vad", response_model=VadResponse, response_model_by_alias=True)
async def vad(
    body: Annotated[bytes, Body(media_type="application/octet-stream")],
    session_id: Annotated[str, Header(alias="x-session-id")],
    sample_rate: Annotated[int, Header(alias="x-sample-rate")] = 16000,
    threshold: Annotated[float, Header(alias="x-vad-threshold")] = 0.5,
    min_silence_ms: Annotated[int, Header(alias="x-min-silence-ms")] = DEFAULT_MIN_SILENCE_MS,
) -> VadResponse:
    try:
        return await asyncio.to_thread(
            vad_engine.process,
            session_id,
            body,
            sample_rate,
            threshold,
            min_silence_ms,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/v1/vad/reset")
async def reset_vad(request: ResetRequest) -> dict[str, bool]:
    await asyncio.to_thread(vad_engine.reset, request.session_id)
    return {"ok": True}


@app.post(
    "/v1/transcribe",
    response_model=TranscriptionResponse,
    response_model_by_alias=True,
)
async def transcribe(
    audio: Annotated[UploadFile, File()],
    sample_rate_hz: Annotated[int, Form()] = 16000,
    language: Annotated[str, Form()] = "auto",
    beam_size: Annotated[int, Form()] = 5,
    model: Annotated[str, Form()] = "medium",
    device: Annotated[str, Form()] = "auto",
    compute_type: Annotated[str, Form()] = "float16",
) -> TranscriptionResponse:
    if sample_rate_hz != 16000:
        raise HTTPException(status_code=400, detail="STT requires 16 kHz PCM")
    pcm = await audio.read()
    samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    duration_ms = samples.size * 1000.0 / sample_rate_hz
    started = time.perf_counter()

    def run():
        whisper = whisper_models.get(model, device, compute_type)
        segments, info = whisper.transcribe(
            samples,
            language=None if language == "auto" else language,
            beam_size=beam_size,
            vad_filter=False,
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return text, info

    text, info = await asyncio.to_thread(run)
    detected = info.language if info.language in {"en", "fa"} else "en"
    return TranscriptionResponse(
        text=text,
        language=detected,
        languageProbability=float(info.language_probability),
        durationMs=duration_ms,
        inferenceMs=(time.perf_counter() - started) * 1000.0,
    )


@app.post(
    "/v1/synthesize",
    response_model=SynthesisResponse,
    response_model_by_alias=True,
)
async def synthesize(request: SynthesisRequest) -> SynthesisResponse:
    try:
        pcm, sample_rate = await asyncio.to_thread(
            piper_engine.synthesize,
            request.text,
            request.model,
            request.executable,
            request.speaking_rate,
            request.language,
        )
    except FileNotFoundError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return SynthesisResponse(
        audioBase64=base64.b64encode(pcm).decode("ascii"),
        sampleRateHz=sample_rate,
    )


@app.post("/v1/synthesize/stream")
async def synthesize_stream(request: SynthesisRequest) -> StreamingResponse:
    """Chunked raw PCM so Node can start playback before synthesis finishes.

    The sample rate is resolved up front and returned in `x-sample-rate`, since
    a chunked body has no place to carry it and the caller needs it to open the
    audio sink before the first chunk arrives.
    """
    try:
        plan = await asyncio.to_thread(
            piper_engine.prepare,
            request.text,
            request.model,
            request.speaking_rate,
            request.language,
        )
    except FileNotFoundError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    async def body() -> AsyncIterator[bytes]:
        # Some HTTP stacks (Node fetch on Windows + uvicorn) do not complete
        # the response until the first body byte. 32 ms of silence unblocks
        # playback setup while Piper loads the voice.
        yield bytes(int(plan.sample_rate * 0.032) * 2)
        chunks = piper_engine.iter_synthesize(plan, request.executable)
        try:
            while True:
                # Piper is synchronous and CPU-bound; stepping the generator in a
                # worker thread keeps the event loop free to notice disconnects.
                chunk = await asyncio.to_thread(next, chunks, None)
                if chunk is None:
                    break
                yield chunk
        finally:
            chunks.close()

    return StreamingResponse(
        body(),
        media_type="application/octet-stream",
        headers={
            "x-sample-rate": str(plan.sample_rate),
            "x-audio-format": "s16le",
            "x-channels": "1",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )

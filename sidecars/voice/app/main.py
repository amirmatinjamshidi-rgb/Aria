from __future__ import annotations

import asyncio
import base64
import json
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Annotated, Literal

import numpy as np
import torch
from fastapi import Body, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from silero_vad import load_silero_vad

app = FastAPI(title="Aria Voice Inference", version="1.0.0")


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
    def __init__(self) -> None:
        self._models: dict[tuple[str, str, str], object] = {}
        self._lock = Lock()

    def get(self, name: str, device: str, compute_type: str):
        from faster_whisper import WhisperModel

        resolved_device = (
            "cuda" if device == "auto" and torch.cuda.is_available() else device
        )
        if resolved_device == "auto":
            resolved_device = "cpu"
        resolved_compute = compute_type
        if resolved_device == "cpu" and compute_type == "float16":
            resolved_compute = "int8"
        key = (name, resolved_device, resolved_compute)
        with self._lock:
            if key not in self._models:
                self._models[key] = WhisperModel(
                    name,
                    device=resolved_device,
                    compute_type=resolved_compute,
                )
            return self._models[key]


vad_engine = SileroEngine()
whisper_models = WhisperModels()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/vad", response_model=VadResponse, response_model_by_alias=True)
async def vad(
    body: Annotated[bytes, Body(media_type="application/octet-stream")],
    session_id: Annotated[str, Header(alias="x-session-id")],
    sample_rate: Annotated[int, Header(alias="x-sample-rate")] = 16000,
    threshold: Annotated[float, Header(alias="x-vad-threshold")] = 0.5,
    min_silence_ms: Annotated[int, Header(alias="x-min-silence-ms")] = 500,
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
    model_path = Path(request.model)
    # #region agent log
    try:
        import json as _json
        from pathlib import Path as _Path
        _log = _Path(__file__).resolve().parents[3] / "debug-8aa307.log"
        with _log.open("a", encoding="utf-8") as _f:
            _f.write(_json.dumps({"sessionId":"8aa307","hypothesisId":"B","location":"main.py:synthesize","message":"sidecar synthesize entry","data":{"model":request.model,"executable":request.executable,"modelExists":model_path.is_file(),"cwd":str(_Path.cwd()),"resolvedModel":str(model_path.resolve()) if model_path.exists() else str(model_path),"textLen":len(request.text)},"timestamp":__import__("time").time()*1000}) + "\n")
    except Exception:
        pass
    # #endregion
    if not model_path.is_file():
        raise HTTPException(
            status_code=400, detail=f"Piper model not found: {model_path}"
        )

    args = [request.executable, "--model", str(model_path), "--output-raw"]
    if request.speaking_rate and request.speaking_rate > 0:
        args.extend(["--length-scale", str(1.0 / request.speaking_rate)])

    def run_piper() -> bytes:
        try:
            result = subprocess.run(
                args,
                input=request.text.encode("utf-8"),
                capture_output=True,
                check=True,
                timeout=60,
            )
            return result.stdout
        except FileNotFoundError as error:
            raise RuntimeError(
                f"Piper executable not found: {request.executable}"
            ) from error
        except subprocess.CalledProcessError as error:
            detail = error.stderr.decode("utf-8", errors="replace")
            raise RuntimeError(f"Piper failed: {detail}") from error

    try:
        pcm = await asyncio.to_thread(run_piper)
    except RuntimeError as error:
        # #region agent log
        try:
            import json as _json
            from pathlib import Path as _Path
            _log = _Path(__file__).resolve().parents[3] / "debug-8aa307.log"
            with _log.open("a", encoding="utf-8") as _f:
                _f.write(_json.dumps({"sessionId":"8aa307","hypothesisId":"B","location":"main.py:synthesize","message":"sidecar synthesize runtime error","data":{"detail":str(error)},"timestamp":__import__("time").time()*1000}) + "\n")
        except Exception:
            pass
        # #endregion
        raise HTTPException(status_code=500, detail=str(error)) from error

    config_path = Path(f"{model_path}.json")
    sample_rate = 22050
    if config_path.is_file():
        config = json.loads(config_path.read_text(encoding="utf-8"))
        sample_rate = int(config.get("audio", {}).get("sample_rate", sample_rate))

    return SynthesisResponse(
        audioBase64=base64.b64encode(pcm).decode("ascii"),
        sampleRateHz=sample_rate,
    )

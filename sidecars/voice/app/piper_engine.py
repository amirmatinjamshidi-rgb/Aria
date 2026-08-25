"""In-process Piper TTS with Unicode-safe Persian phonemization.

Shelling UTF-8 Persian into `piper.exe` on Windows often decodes stdin as
cp1252, so Ganji speaks English-like gibberish. PiperVoice.load() keeps the
text as a Python str and uses espeak-ng `fa` from the model JSON.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from collections.abc import Iterator
from pathlib import Path
from threading import Lock
from typing import Any

HAS_PERSIAN = re.compile(r"[\u0600-\u06FF]")

# 32 ms of 16 kHz mono s16le — small enough to keep first-audio latency low.
_CLI_CHUNK_BYTES = 1024

# eSpeak-ng `fa` expects Persian code points, not Arabic Yeh/Kaf.
_PERSIAN_LETTERS = str.maketrans(
    {
        "\u064a": "\u06cc",  # ي → ی
        "\u0649": "\u06cc",  # ى → ی
        "\u0643": "\u06a9",  # ك → ک
        "\u0629": "\u0647",  # ة → ه
        "\u06d5": "\u0647",  # ە → ه
    }
)


def is_persian_model(model_path: str) -> bool:
    name = Path(model_path).name.lower()
    return name.startswith("fa_") or "_fa_" in name or "ganji" in name or "gyro" in name


def normalize_for_piper(text: str, language: str | None = None) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"[*_`#]+", "", cleaned)
    if language == "fa" or HAS_PERSIAN.search(cleaned):
        cleaned = cleaned.translate(_PERSIAN_LETTERS)
    return cleaned


def model_config_path(model_path: Path) -> Path:
    return Path(f"{model_path}.json")


def read_sample_rate(model_path: Path, fallback: int = 22050) -> int:
    config_path = model_config_path(model_path)
    if not config_path.is_file():
        return fallback
    config = json.loads(config_path.read_text(encoding="utf-8"))
    return int(config.get("audio", {}).get("sample_rate", fallback))


def read_espeak_voice(model_path: Path) -> str | None:
    config_path = model_config_path(model_path)
    if not config_path.is_file():
        return None
    config = json.loads(config_path.read_text(encoding="utf-8"))
    espeak = config.get("espeak")
    if isinstance(espeak, dict):
        voice = espeak.get("voice")
        return str(voice) if voice else None
    return None


def _iter_pcm_from_voice(
    voice: Any, text: str, length_scale: float | None
) -> Iterator[bytes]:
    """Yield raw s16le PCM as Piper produces it, across Piper 1.2/1.3 APIs."""
    kwargs: dict[str, Any] = {}
    if length_scale is not None and length_scale > 0:
        kwargs["length_scale"] = length_scale

    if hasattr(voice, "synthesize_stream_raw"):
        yield from voice.synthesize_stream_raw(text, **kwargs)
        return

    try:
        from piper import SynthesisConfig

        syn_config = SynthesisConfig(**kwargs) if kwargs else SynthesisConfig()
        iterator = voice.synthesize(text, syn_config=syn_config)
    except TypeError:
        iterator = voice.synthesize(text, **kwargs) if kwargs else voice.synthesize(text)
    except ImportError:
        iterator = voice.synthesize(text, **kwargs) if kwargs else voice.synthesize(text)

    for chunk in iterator:
        audio = getattr(chunk, "audio_int16_bytes", None)
        if audio is None:
            audio = getattr(chunk, "audio_bytes", None)
        if audio is None:
            raise RuntimeError(f"Unsupported Piper audio chunk: {type(chunk)!r}")
        yield audio


def _pcm_from_voice(voice: Any, text: str, length_scale: float | None) -> bytes:
    return b"".join(_iter_pcm_from_voice(voice, text, length_scale))


def _load_piper_voice(model_path: Path) -> Any:
    try:
        from piper.voice import PiperVoice
    except ImportError:
        from piper import PiperVoice

    config_path = model_config_path(model_path)
    if not config_path.is_file():
        raise FileNotFoundError(
            f"Piper config missing: {config_path}. "
            "Persian voices need the .onnx.json so eSpeak uses `fa`, not English."
        )
    return PiperVoice.load(str(model_path))


def _ensure_persian_espeak(voice: Any, model_path: Path) -> str:
    expected = read_espeak_voice(model_path) or "fa"
    config = getattr(voice, "config", None)
    current = getattr(config, "espeak_voice", None) if config is not None else None
    if is_persian_model(str(model_path)) and current in (None, "", "en"):
        if config is not None and hasattr(config, "espeak_voice"):
            config.espeak_voice = expected
            current = expected
    return str(current or expected)


@dataclass(frozen=True)
class PreparedSynthesis:
    model_path: Path
    text: str
    length_scale: float | None
    sample_rate: int


class PiperEngine:
    def __init__(self) -> None:
        self._voices: dict[str, Any] = {}
        self._lock = Lock()

    def prepare(
        self,
        text: str,
        model: str,
        speaking_rate: float | None = None,
        language: str | None = None,
    ) -> PreparedSynthesis:
        """Validate inputs and resolve the output format before any audio runs.

        Streaming callers need this split out: once the response body has been
        committed there is no way to report a bad model path as a 4xx.
        """
        model_path = Path(model)
        if not model_path.is_file():
            raise FileNotFoundError(f"Piper model not found: {model_path}")

        prepared = normalize_for_piper(text, language)
        if not prepared:
            raise ValueError("Empty text after TTS normalization")

        length_scale = None
        if speaking_rate and speaking_rate > 0:
            length_scale = 1.0 / speaking_rate

        return PreparedSynthesis(
            model_path=model_path,
            text=prepared,
            length_scale=length_scale,
            sample_rate=read_sample_rate(model_path),
        )

    def synthesize(
        self,
        text: str,
        model: str,
        executable: str = "piper",
        speaking_rate: float | None = None,
        language: str | None = None,
    ) -> tuple[bytes, int]:
        plan = self.prepare(text, model, speaking_rate, language)
        model_path = plan.model_path
        prepared = plan.text
        length_scale = plan.length_scale
        sample_rate = plan.sample_rate
        try:
            pcm = self._synthesize_inprocess(model_path, prepared, length_scale)
            return pcm, sample_rate
        except Exception as error:
            print(
                f"[aria-voice] in-process Piper failed ({error!s}); "
                "falling back to CLI with UTF-8 stdin",
                flush=True,
            )
            pcm = self._synthesize_cli(
                model_path, prepared, executable, length_scale
            )
            return pcm, sample_rate

    def iter_synthesize(
        self,
        plan: PreparedSynthesis,
        executable: str = "piper",
    ) -> Iterator[bytes]:
        """Yield PCM chunks as Piper emits them, for sentence-level pipelining.

        Falls back to the CLI only while no audio has been emitted yet; a
        mid-stream failure has to propagate because the client is already
        consuming bytes and cannot be restarted transparently.
        """
        emitted = 0
        try:
            for chunk in self._stream_inprocess(
                plan.model_path, plan.text, plan.length_scale
            ):
                if not chunk:
                    continue
                emitted += 1
                yield chunk
        except Exception as error:
            if emitted > 0:
                raise
            print(
                f"[aria-voice] in-process Piper stream failed ({error!s}); "
                "falling back to CLI with UTF-8 stdin",
                flush=True,
            )
            yield from self._stream_cli(
                plan.model_path, plan.text, executable, plan.length_scale
            )
            return

        if emitted == 0:
            # A voice that yields nothing is a silent failure; the CLI path at
            # least surfaces Piper's stderr.
            yield from self._stream_cli(
                plan.model_path, plan.text, executable, plan.length_scale
            )

    def _synthesize_inprocess(
        self,
        model_path: Path,
        text: str,
        length_scale: float | None,
    ) -> bytes:
        return b"".join(self._stream_inprocess(model_path, text, length_scale))

    def _stream_inprocess(
        self,
        model_path: Path,
        text: str,
        length_scale: float | None,
    ) -> Iterator[bytes]:
        key = str(model_path.resolve())
        with self._lock:
            voice = self._voices.get(key)
            if voice is None:
                voice = _load_piper_voice(model_path)
                espeak = _ensure_persian_espeak(voice, model_path)
                print(
                    f"[aria-voice] loaded Piper voice {model_path.name} "
                    f"espeak={espeak}",
                    flush=True,
                )
                self._voices[key] = voice
            else:
                espeak = _ensure_persian_espeak(voice, model_path)

        if is_persian_model(str(model_path)) and not HAS_PERSIAN.search(text):
            print(
                "[aria-voice] Persian Piper model got no Persian script — "
                "Ganji will still run, but pronunciation may sound Latin",
                flush=True,
            )
        elif is_persian_model(str(model_path)):
            print(
                f"[aria-voice] synthesizing fa via {model_path.name} "
                f"espeak={espeak} chars={len(text)}",
                flush=True,
            )

        yield from _iter_pcm_from_voice(voice, text, length_scale)

    def _synthesize_cli(
        self,
        model_path: Path,
        text: str,
        executable: str,
        length_scale: float | None,
    ) -> bytes:
        args = [executable, "--model", str(model_path), "--output-raw"]
        if length_scale is not None:
            args.extend(["--length-scale", str(length_scale)])
        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        try:
            result = subprocess.run(
                args,
                input=text.encode("utf-8"),
                capture_output=True,
                check=True,
                timeout=60,
                env=env,
            )
        except FileNotFoundError as error:
            raise RuntimeError(f"Piper executable not found: {executable}") from error
        except subprocess.CalledProcessError as error:
            detail = (
                error.stderr.decode("utf-8", errors="replace") if error.stderr else ""
            )
            raise RuntimeError(f"Piper failed: {detail}") from error
        return result.stdout

    def _stream_cli(
        self,
        model_path: Path,
        text: str,
        executable: str,
        length_scale: float | None,
    ) -> Iterator[bytes]:
        args = [executable, "--model", str(model_path), "--output-raw"]
        if length_scale is not None:
            args.extend(["--length-scale", str(length_scale)])
        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"

        try:
            process = subprocess.Popen(
                args,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
            )
        except FileNotFoundError as error:
            raise RuntimeError(f"Piper executable not found: {executable}") from error

        try:
            assert process.stdin is not None
            assert process.stdout is not None
            process.stdin.write(text.encode("utf-8"))
            process.stdin.close()
            while True:
                chunk = process.stdout.read(_CLI_CHUNK_BYTES)
                if not chunk:
                    break
                yield chunk
        except GeneratorExit:
            # The client hung up (barge-in); don't leave piper.exe running.
            process.kill()
            raise
        except BrokenPipeError as error:
            process.kill()
            process.wait()
            raise RuntimeError("Piper closed stdin before receiving text") from error

        try:
            process.wait(timeout=60)
        except subprocess.TimeoutExpired as error:
            process.kill()
            process.wait()
            raise RuntimeError("Piper timed out after closing its output") from error

        if process.returncode != 0:
            detail = ""
            if process.stderr is not None:
                detail = process.stderr.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Piper failed: {detail}")

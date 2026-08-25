from __future__ import annotations

import unittest
from pathlib import Path
from typing import Any

from app.piper_engine import (
    PiperEngine,
    PreparedSynthesis,
    _iter_pcm_from_voice,
    is_persian_model,
    normalize_for_piper,
)


class NormalizeForPiperTest(unittest.TestCase):
    def test_maps_arabic_yeh_and_kaf_to_persian(self) -> None:
        # Arabic Yeh/Kaf that LLMs often emit
        raw = "يك كتاب"
        out = normalize_for_piper(raw, "fa")
        self.assertIn("\u06cc", out)
        self.assertIn("\u06a9", out)
        self.assertNotIn("\u064a", out)
        self.assertNotIn("\u0643", out)

    def test_strips_markdown_markers(self) -> None:
        self.assertEqual(normalize_for_piper("**سلام**", "fa"), "سلام")

    def test_leaves_english_alone(self) -> None:
        self.assertEqual(normalize_for_piper("Hello there", "en"), "Hello there")

    def test_detects_persian_models(self) -> None:
        self.assertTrue(is_persian_model("D:/Aria/models/piper/fa_IR-ganji-medium.onnx"))
        self.assertFalse(is_persian_model("en_US-lessac-medium.onnx"))


class StreamRawVoice:
    """Piper 1.2-style voice exposing `synthesize_stream_raw`."""

    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.length_scale: float | None = None

    def synthesize_stream_raw(self, text: str, **kwargs: Any):
        self.length_scale = kwargs.get("length_scale")
        yield from self.chunks


class AudioChunk:
    def __init__(self, payload: bytes) -> None:
        self.audio_int16_bytes = payload


class ChunkedVoice:
    """Piper 1.3-style voice yielding chunk objects from `synthesize`."""

    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks

    def synthesize(self, text: str, **kwargs: Any):
        return (AudioChunk(chunk) for chunk in self.chunks)


class IterPcmTest(unittest.TestCase):
    def test_streams_raw_chunks_lazily(self) -> None:
        voice = StreamRawVoice([b"\x01\x02", b"\x03\x04"])
        self.assertEqual(
            list(_iter_pcm_from_voice(voice, "hi", None)), [b"\x01\x02", b"\x03\x04"]
        )

    def test_forwards_length_scale(self) -> None:
        voice = StreamRawVoice([b"\x00\x00"])
        list(_iter_pcm_from_voice(voice, "hi", 0.5))
        self.assertEqual(voice.length_scale, 0.5)

    def test_omits_length_scale_when_unset(self) -> None:
        voice = StreamRawVoice([b"\x00\x00"])
        list(_iter_pcm_from_voice(voice, "hi", None))
        self.assertIsNone(voice.length_scale)

    def test_unwraps_chunk_objects(self) -> None:
        voice = ChunkedVoice([b"\x05\x06"])
        self.assertEqual(list(_iter_pcm_from_voice(voice, "hi", None)), [b"\x05\x06"])


class IterSynthesizeTest(unittest.TestCase):
    def _plan(self) -> PreparedSynthesis:
        return PreparedSynthesis(
            model_path=Path("model.onnx"),
            text="hello",
            length_scale=None,
            sample_rate=22050,
        )

    def test_passes_through_inprocess_chunks(self) -> None:
        engine = PiperEngine()
        engine._stream_inprocess = lambda *_: iter([b"\x01", b"", b"\x02"])  # type: ignore[method-assign]
        self.assertEqual(list(engine.iter_synthesize(self._plan())), [b"\x01", b"\x02"])

    def test_falls_back_to_cli_when_nothing_emitted(self) -> None:
        engine = PiperEngine()
        engine._stream_inprocess = lambda *_: iter([])  # type: ignore[method-assign]
        engine._stream_cli = lambda *_: iter([b"\xaa"])  # type: ignore[method-assign]
        self.assertEqual(list(engine.iter_synthesize(self._plan())), [b"\xaa"])

    def test_falls_back_to_cli_when_inprocess_fails_before_audio(self) -> None:
        def boom(*_: Any):
            raise RuntimeError("no espeak")
            yield b""  # pragma: no cover - generator marker

        engine = PiperEngine()
        engine._stream_inprocess = boom  # type: ignore[method-assign]
        engine._stream_cli = lambda *_: iter([b"\xbb"])  # type: ignore[method-assign]
        self.assertEqual(list(engine.iter_synthesize(self._plan())), [b"\xbb"])

    def test_reraises_when_inprocess_fails_mid_stream(self) -> None:
        def half(*_: Any):
            yield b"\x01"
            raise RuntimeError("died mid utterance")

        engine = PiperEngine()
        engine._stream_inprocess = half  # type: ignore[method-assign]
        engine._stream_cli = lambda *_: iter([b"\xcc"])  # type: ignore[method-assign]

        stream = engine.iter_synthesize(self._plan())
        self.assertEqual(next(stream), b"\x01")
        with self.assertRaises(RuntimeError):
            next(stream)


if __name__ == "__main__":
    unittest.main()

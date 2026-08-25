"""Cheap frame-change detection so expensive vision work can be skipped.

A Gemini call costs a network round trip and a rate-limit token; a YOLO pass
costs VRAM. Most consecutive frames from a static desk camera are visually
identical, so the pipeline compares a tiny grayscale thumbnail first and only
escalates to the real models when the scene actually moved.
"""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock

import cv2
import numpy as np

# Diff resolution. 360p grayscale is small enough that the comparison is free
# relative to a camera read, and coarse enough that sensor noise and JPEG
# artifacts do not register as motion.
DIFF_HEIGHT = 360

# Mean squared error below this counts as "same scene". Tuned so that webcam
# grain and lighting flicker stay under it while a moved hand or a switched
# window goes above.
DEFAULT_MSE_THRESHOLD = 12.0


@dataclass(frozen=True)
class FrameDelta:
    """Outcome of comparing a frame against the previous one in its session."""

    mse: float
    changed: bool
    #: True when there was no previous frame, which always counts as changed.
    first_frame: bool


def to_diff_thumbnail(frame: np.ndarray, height: int = DIFF_HEIGHT) -> np.ndarray:
    """Downscale to `height` px grayscale, preserving aspect ratio."""
    if frame.ndim not in (2, 3):
        raise ValueError(f"Expected a 2D or 3D image, got shape {frame.shape!r}")
    if frame.size == 0 or frame.shape[0] == 0 or frame.shape[1] == 0:
        # Checked before cvtColor, which raises cv2.error rather than ValueError.
        raise ValueError("Cannot diff an empty frame")

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame

    source_height, source_width = gray.shape[:2]
    if source_height <= height:
        return gray

    scale = height / float(source_height)
    return cv2.resize(
        gray,
        (max(1, int(round(source_width * scale))), height),
        interpolation=cv2.INTER_AREA,
    )


def frame_mse(current: np.ndarray, previous: np.ndarray) -> float:
    """Mean squared error between two same-size grayscale thumbnails.

    MSE = 1/(M*N) * sum((I1 - I2)^2), computed in float32 so the squared
    difference of two uint8 pixels cannot wrap around.
    """
    if current.shape != previous.shape:
        raise ValueError(
            f"Frame shapes differ: {current.shape!r} vs {previous.shape!r}"
        )
    delta = current.astype(np.float32) - previous.astype(np.float32)
    return float(np.mean(np.square(delta)))


class FrameDiffer:
    """Remembers the last thumbnail per session and reports what changed.

    Sessions are keyed by caller-supplied id so a screen-watch loop and a camera
    loop do not invalidate each other's baselines.
    """

    def __init__(self, threshold: float = DEFAULT_MSE_THRESHOLD) -> None:
        self._threshold = threshold
        self._previous: dict[str, np.ndarray] = {}
        self._lock = Lock()

    def compare(
        self,
        session_id: str,
        frame: np.ndarray,
        threshold: float | None = None,
    ) -> FrameDelta:
        """Compare `frame` to the session's previous frame and become the baseline."""
        limit = self._threshold if threshold is None else threshold
        thumbnail = to_diff_thumbnail(frame)

        with self._lock:
            previous = self._previous.get(session_id)
            self._previous[session_id] = thumbnail

        if previous is None or previous.shape != thumbnail.shape:
            # A resolution change means a different source; treat it as new.
            return FrameDelta(mse=float("inf"), changed=True, first_frame=True)

        mse = frame_mse(thumbnail, previous)
        return FrameDelta(mse=mse, changed=mse >= limit, first_frame=False)

    def reset(self, session_id: str | None = None) -> None:
        """Forget baselines so the next frame is reported as changed."""
        with self._lock:
            if session_id is None:
                self._previous.clear()
            else:
                self._previous.pop(session_id, None)

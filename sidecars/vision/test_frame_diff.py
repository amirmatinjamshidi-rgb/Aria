from __future__ import annotations

import unittest

import numpy as np

from app.frame_diff import (
    DEFAULT_MSE_THRESHOLD,
    DIFF_HEIGHT,
    FrameDiffer,
    frame_mse,
    to_diff_thumbnail,
)


def solid(value: int, height: int = 720, width: int = 1280) -> np.ndarray:
    return np.full((height, width, 3), value, dtype=np.uint8)


def noisy(base: int, amplitude: int, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    noise = rng.integers(-amplitude, amplitude + 1, size=(720, 1280, 3))
    return np.clip(base + noise, 0, 255).astype(np.uint8)


class ThumbnailTest(unittest.TestCase):
    def test_downscales_to_360p_grayscale(self) -> None:
        thumb = to_diff_thumbnail(solid(128))
        self.assertEqual(thumb.ndim, 2)
        self.assertEqual(thumb.shape[0], DIFF_HEIGHT)
        self.assertEqual(thumb.shape[1], 640)

    def test_leaves_already_small_frames_alone(self) -> None:
        thumb = to_diff_thumbnail(solid(10, height=200, width=320))
        self.assertEqual(thumb.shape, (200, 320))

    def test_accepts_grayscale_input(self) -> None:
        gray = np.full((720, 1280), 40, dtype=np.uint8)
        self.assertEqual(to_diff_thumbnail(gray).shape[0], DIFF_HEIGHT)

    def test_rejects_empty_frame(self) -> None:
        with self.assertRaises(ValueError):
            to_diff_thumbnail(np.zeros((0, 0, 3), dtype=np.uint8))


class FrameMseTest(unittest.TestCase):
    def test_identical_frames_score_zero(self) -> None:
        thumb = to_diff_thumbnail(solid(100))
        self.assertEqual(frame_mse(thumb, thumb), 0.0)

    def test_matches_the_squared_difference(self) -> None:
        a = np.full((4, 4), 10, dtype=np.uint8)
        b = np.full((4, 4), 13, dtype=np.uint8)
        self.assertAlmostEqual(frame_mse(a, b), 9.0)

    def test_does_not_wrap_on_uint8_underflow(self) -> None:
        a = np.full((2, 2), 0, dtype=np.uint8)
        b = np.full((2, 2), 255, dtype=np.uint8)
        self.assertAlmostEqual(frame_mse(a, b), 255.0**2)

    def test_rejects_mismatched_shapes(self) -> None:
        with self.assertRaises(ValueError):
            frame_mse(np.zeros((4, 4), np.uint8), np.zeros((4, 5), np.uint8))


class FrameDifferTest(unittest.TestCase):
    def test_first_frame_is_always_changed(self) -> None:
        delta = FrameDiffer().compare("s", solid(50))
        self.assertTrue(delta.changed)
        self.assertTrue(delta.first_frame)

    def test_static_scene_is_unchanged(self) -> None:
        differ = FrameDiffer()
        differ.compare("s", solid(50))
        delta = differ.compare("s", solid(50))
        self.assertFalse(delta.changed)
        self.assertEqual(delta.mse, 0.0)
        self.assertFalse(delta.first_frame)

    def test_sensor_noise_stays_below_threshold(self) -> None:
        differ = FrameDiffer()
        differ.compare("s", noisy(120, 3, seed=1))
        delta = differ.compare("s", noisy(120, 3, seed=2))
        self.assertLess(delta.mse, DEFAULT_MSE_THRESHOLD)
        self.assertFalse(delta.changed)

    def test_scene_change_exceeds_threshold(self) -> None:
        differ = FrameDiffer()
        differ.compare("s", solid(40))
        delta = differ.compare("s", solid(200))
        self.assertGreater(delta.mse, DEFAULT_MSE_THRESHOLD)
        self.assertTrue(delta.changed)

    def test_threshold_is_overridable_per_call(self) -> None:
        differ = FrameDiffer()
        differ.compare("s", solid(100))
        # A 4-level shift is MSE 16: over the default, under an explicit 100.
        self.assertTrue(differ.compare("s", solid(104)).changed)
        differ.compare("s", solid(100))
        self.assertFalse(differ.compare("s", solid(104), threshold=100.0).changed)

    def test_sessions_keep_independent_baselines(self) -> None:
        differ = FrameDiffer()
        differ.compare("camera", solid(30))
        differ.compare("screen", solid(220))
        self.assertFalse(differ.compare("camera", solid(30)).changed)
        self.assertFalse(differ.compare("screen", solid(220)).changed)

    def test_resolution_change_counts_as_new_source(self) -> None:
        differ = FrameDiffer()
        differ.compare("s", solid(60, height=720, width=1280))
        delta = differ.compare("s", solid(60, height=720, width=960))
        self.assertTrue(delta.changed)
        self.assertTrue(delta.first_frame)

    def test_reset_forces_the_next_frame_to_change(self) -> None:
        differ = FrameDiffer()
        differ.compare("s", solid(90))
        differ.reset("s")
        self.assertTrue(differ.compare("s", solid(90)).first_frame)

    def test_reset_all_clears_every_session(self) -> None:
        differ = FrameDiffer()
        differ.compare("a", solid(90))
        differ.compare("b", solid(90))
        differ.reset()
        self.assertTrue(differ.compare("a", solid(90)).first_frame)
        self.assertTrue(differ.compare("b", solid(90)).first_frame)


if __name__ == "__main__":
    unittest.main()

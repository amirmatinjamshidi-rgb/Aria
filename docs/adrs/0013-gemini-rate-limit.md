# ADR-0013: Gemini vision rate limiting

## Status

Accepted (2026-08-12); amended 2026-08-14 (token bucket + frame diff)

## Context

Continuous scene loops at ~1 Hz against Gemini free tier produce HTTP **429 Too Many Requests**, empty scenes, and noisy logs. Most consecutive desk-camera frames are visually identical, so paying for them is waste.

## Decision

1. Default Gemini analyze interval **4500 ms** (~13 RPM); local sidecar stays **1000 ms**.
2. Client-side **token bucket** (capacity 1, refill = `ARIA_GEMINI_MIN_INTERVAL_MS`, default 4500 ms) wraps every Gemini call. A 429 extends the block via `Retry-After` / exponential backoff; last good scene is reused.
3. Scene loop uses adaptive `setTimeout` scheduling (not a fixed `setInterval`).
4. Sidecar `POST /v1/frame/delta` diffs 360p grayscale frames (MSE < 12 = unchanged). Unchanged ticks **skip Gemini** and keep `InMemoryVisionSceneStore`. Explicit vision tools pass `force=true`.

## Consequences

- Preview frames still poll the local capture sidecar quickly; only *analysis* is throttled.
- A static scene consumes no Gemini quota after the first frame.
- Operators can switch to `sidecar` for high-rate detection without cloud quota.

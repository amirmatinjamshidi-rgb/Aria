# ADR-0012: Voice turn queue (no vanish) + PTT finalize

## Status

Accepted (2026-08-12)

## Context

Two bugs hurt the web lab:

1. Releasing push-to-talk stopped PCM before VAD saw silence → utterance never finalized (“vanished”).
2. Speaking again while Aria was *thinking* barge-in-cancelled the in-flight brain turn → first answer lost.

## Decision

1. **Barge-in only in `speaking`** (interrupt TTS).
2. Speech during `thinking` / `transcribing` is **queued** and started after `finishTurn`.
3. `ptt_stop` calls `VoicePipeline.finalizeCapture()` to force-end the capture.
4. Mic button uses **pointer capture** so leaving the button mid-hold does not abort.

## Consequences

- Users get both answers when they talk twice quickly during thinking.
- Explicit Interrupt control still cancels.
- Acoustic echo cancellation remains deferred; headphones recommended.

# ADR-0014: Sentence-streaming voice pipeline

## Status

Accepted (2026-08-14)

## Context

Waiting for a full LLM completion, then a full Piper utterance, added seconds of
dead air after end-of-speech. Voice must stay decoupled from the LLM (ADR-0002):
`apps/voice` must not import `ILLMProvider`.

## Decision

1. `ILLMProvider.generateStream` yields content deltas. Brain publishes them as
   `conversation.assistant_delta` (plus a terminal `done` event). Tool-offering
   rounds stay on buffered `generate`; the final answer still emits deltas.
2. Voice segments deltas with a sentence matcher and synthesizes each sentence
   via `POST /v1/synthesize/stream` as soon as it completes.
3. Playback keeps **one** audio sink open for the turn (`playStream`) so
   consecutive sentences do not reopen the device.
4. Barge-in still only applies while `speaking`: abort the HTTP audio stream,
   stop the sink, reset matcher state (ADR-0012).

## Consequences

- Time-to-first-audio tracks first-sentence latency, not full-turn latency.
- Adapters without native streams fall back to buffered synthesize/play.
- `ARIA_LLM_STREAMING` / `ARIA_VOICE_STREAMING` disable the path if needed.

# ADR-0008: Web interaction gateway

- Status: Accepted
- Date: 2026-08-04
- Deciders: Chief Software Architect

## Context

Operators need a browser UI instead of the CLI REPL, with a Jarvis-like presence orb and text fallback when the microphone fails. Architecture forbids sibling-app imports (`apps/dashboard` must not import `@aria/brain` or `@aria/voice`). The voice process already composes brain + pipeline in one runtime ([`apps/voice/src/main.ts`](../../apps/voice/src/main.ts)).

## Decision

- Host a local **HTTP + WebSocket gateway** inside the voice composition root (`npm run voice:web`).
- Dashboard (Next.js) is a thin client of `ARIA_GATEWAY_URL` / `NEXT_PUBLIC_ARIA_GATEWAY_URL`.
- Text turns call `VoicePipeline.submitText` (skip STT, keep TTS + barge-in).
- Browser push-to-talk streams 16 kHz mono s16le PCM into `acceptAudioChunk(..., "browser")`.
- `ARIA_AUDIO_SOURCE` selects `ffmpeg` | `browser` | `ffmpeg+browser`.
- Amplitude envelopes for the orb are gateway/WS-only (`voice.amplitude`); no contracts change in v1.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Dashboard imports brain | Fast to wire | Violates no-sibling-import rule |
| Separate NATS multi-process | True distributed bus | Overkill for local operator UI |
| Browser-only Web Speech API | No sidecar | Diverges from Aria STT/TTS stack |
| **Gateway in voice runtime** | One process; shared bus; pure UI | Voice app gains HTTP surface |

## Consequences

- Positive: dashboard stays replaceable; voice/brain stay authoritative for conversation.
- Positive: system mic, browser mic, and text share one conversation + TTS path.
- Negative: gateway and pipeline share a process (acceptable until NATS multi-service deploy).
- Negative: browser mic still lacks AEC; headphones recommended for barge-in tests.

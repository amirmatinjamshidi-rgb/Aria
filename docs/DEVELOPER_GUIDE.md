# Developer Guide

## Repo map

| Path | Responsibility |
|------|----------------|
| `packages/contracts` | Ports, Zod schemas, events (**sacred**) |
| `packages/core` | DI, bus, config, logging, user settings, plugins |
| `packages/tool-runtime` | Tool registry / executor / permissions |
| `apps/brain` | LLM orchestration, personality, tools |
| `apps/voice` | VAD/STT/TTS pipeline + web gateway |
| `apps/vision` | Perception loop + Gemini/YOLO adapters |
| `apps/dashboard` | Next.js operator / lab UI |
| `sidecars/*` | Python inference only — no business logic |
| `docs/` | Architecture, user, provider, ADRs |

**Rule:** apps may import `@aria/contracts` and `@aria/core` (and published packages) — never sibling apps except the intentional voice→brain/vision composition for the web lab.

## Hexagonal + events

- Inside a service: domain depends on **ports**; adapters at the edge
- Between services: **message bus only** (`IMessageBus`)
- Composition roots wire adapters per environment

## Adding a feature

1. Write an ADR under `docs/adrs/`
2. Extend `@aria/contracts` if the public shape changes
3. Implement adapter behind a port
4. Register in composition root / plugin registry
5. Unit + integration tests; update USER_GUIDE / PROVIDERS if user-facing

## Branch workflow (this improvement set)

Feature branches exist for review (no commits forced):

| Branch | Intent |
|--------|--------|
| `docs/master-plan` | Architecture / docs |
| `fix/vision-429` | Gemini rate limits |
| `fix/voice-overlap` | Mic / utterance queue |
| `feat/persian-ganji` | Ganji TTS |
| `feat/dynamic-providers` | User provider settings |
| `wip/review-platform-improvements` | Combined working tree for your review |

Create commits yourself after review, ideally one concern per commit/PR.

## Tests

```bash
npm test -w @aria/voice
npm test -w @aria/vision
npm test -w @aria/brain
npm test -w @aria/contracts
npm test -w @aria/core
```

## Safety

Actuator-facing code must go through `robot-api` + safety monitor (Phase 5+). Cognition publishes intents/goals only.

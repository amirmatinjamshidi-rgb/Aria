# Contributing to Aria

You are building a multi-year robotics platform. Optimize for **clarity, replaceability, and safety** — not speed hacks.

## Development rules

1. **Architecture before code.** For non-trivial features, write or update an ADR explaining the design, alternatives, and tradeoffs.
2. **Contracts first.** Shared types and events live only in `@aria/contracts`. Version breaking schema changes deliberately.
3. **No cross-app imports.** Apps depend on `@aria/contracts` and `@aria/core` only. Wire concretes in the composition root.
4. **Ports for every external system.** LLMs, STT, TTS, vision, memory, bus, skills — all behind interfaces.
5. **No brain → motor coupling.** Actuation goes Brain → Planner → Skill → `robot-api` → ROS2.
6. **Python is inference-only.** No business logic in sidecars.
7. **Production quality.** Document public APIs. Prefer explicit errors over silent fallbacks.
8. **Tests.** Unit tests per package; integration tests per pipeline; simulation gates from Phase 7.
9. **Safety.** Actuator paths must pass the safety monitor; watchdogs and e-stop semantics are not optional add-ons.
10. **Local-first.** Cloud adapters are optional plugins, off by default.

## Workflow

```bash
npm install
npm run build
npm test
npm run lint
npm run typecheck
```

Run the Phase 0 brain demo:

```bash
cp .env.example .env
npm run start -w @aria/brain

# Swap provider — no code changes
ARIA_LLM_PROVIDER=echo npm run start -w @aria/brain
# Online (optional): ARIA_LLM_PROVIDER=openrouter ARIA_OPENROUTER_API_KEY=...
```

## Commit expectations

- Small, focused commits
- Message explains **why**
- Do not commit secrets, `.env`, or large model weights (`*.gguf`, etc.)

## Code style

- TypeScript `strict` + `noUncheckedIndexedAccess`
- ESM (`NodeNext`)
- Exhaustive `switch` with `never` default for unions/enums
- Imports at top of file (no inline imports)
- Zod at trust boundaries (env, events, tool args)

## Adding a new LLM provider (example)

1. Implement `ILLMProvider` in `apps/brain/src/plugins/`.
2. Register it in the composition root plugin registry.
3. Add the id to `AriaConfigSchema` / `.env.example`.
4. Add a swap test proving conversation service is unchanged.
5. Update ADR-0004 if quantization assumptions change.

## Review checklist

- [ ] Ports unchanged or versioned intentionally
- [ ] No sibling-app imports
- [ ] Tests cover happy path + failure
- [ ] Docs/ADR updated if architecture shifted
- [ ] Safety impact considered for anything near actuators

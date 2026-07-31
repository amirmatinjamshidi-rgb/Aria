# ADR-0006: Phase 1 brain quality stack (personality, synthesis, session memory, eval)

- Status: Accepted
- Date: 2026-07-31
- Deciders: Lead Software Architect

## Context

Phase 1 foundation (Ollama adapter, tool loop, basic personality) worked end-to-end, but user-facing quality lagged: raw JSON tool dumps, weak prompt policy, no session memory, no planner validation, and no automated regression scores.

Full `apps/memory` (Chroma) and `apps/planner` (BT/GOAP) remain Phase 3 / Phase 5. Phase 1 still needs production-shaped seams inside the brain.

## Decision

Keep hexagonal ports; extend the brain with:

1. **`IPersonalityService` / `PersonalityService`** — prompt policy outside LLM adapters; cached system prompts.
2. **`IToolResultSynthesizer`** — natural-language tool narratives; never format inside tools.
3. **`IConversationPlanner`** — soft assess + hard tool-call validation (dedupe/unknown/unsafe), independent of LLM vendor.
4. **`SessionMemoryStore` implementing `IMemoryStore`** — in-process preferences with upsert, lexical ranking, TTL decay; swap later for Chroma.
5. **Turn metrics + eval/benchmark runners** — measurable scores for personality, tools, synthesis, safety, language, latency.

Conversation flow:

`utterance → planner.assess → memory.query → personality prompt → LLM → planner.validateToolCalls → tools → synthesizer → reply (+ metrics)`

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Put formatting in each tool | Simple | Duplicates NL logic; hard to localize |
| Force tools via planner (no LLM choice) | Deterministic | Breaks “LLM decides when” |
| Skip memory until Phase 3 | Less code | Preference demos forget immediately |
| Embeddings now | Better recall | Heavy for Phase 1; belongs in memory app |

## Consequences

- Positive: provider swap still works; quality is testable offline with mock.
- Positive: Phase 3/5 can replace session memory / conversation planner without rewriting ConversationService ports.
- Negative: lexical memory is weak vs embeddings — documented debt.
- Negative: GPU utilization not collected in-process (use nvidia-smi externally).

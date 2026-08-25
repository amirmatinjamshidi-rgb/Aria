# Architecture Decision Records

This directory holds ADRs for Aria. Every significant architectural choice gets an ADR **before** code lands.

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-monorepo-first.md) | Monorepo-first, multi-repo-ready | Accepted |
| [0002](0002-message-bus.md) | Message bus: in-process + NATS port | Accepted |
| [0003](0003-planner-bt-goap-hybrid.md) | Planner: BT + GOAP hybrid | Accepted |
| [0004](0004-model-quantization-rtx4060.md) | Local model quantization for RTX 4060 | Accepted |
| [0005](0005-ollama-llm-runtime.md) | Ollama as primary local LLM runtime | Accepted |
| [0006](0006-phase1-brain-quality.md) | Phase 1 brain quality stack | Accepted |
| [0007](0007-openrouter-llm-provider.md) | OpenRouter optional online LLM | Accepted |
| [0008](0008-web-interaction-gateway.md) | Web interaction gateway | Accepted |
| [0009](0009-web-search-fetch-tools.md) | Web search and page fetch tools | Accepted |
| [0010](0010-tool-platform.md) | Tool Platform (registry, executor, search) | Accepted |
| [0011](0011-dynamic-providers.md) | Dynamic per-user providers and API keys | Accepted |
| [0012](0012-voice-turn-queue.md) | Voice turn queue + PTT finalize | Accepted |
| [0013](0013-gemini-rate-limit.md) | Gemini vision rate limiting | Accepted |
| [0014](0014-sentence-streaming.md) | Sentence-streaming voice pipeline | Accepted |

## Template

```markdown
# ADR-NNNN: Title

- Status: Proposed | Accepted | Deprecated | Superseded
- Date: YYYY-MM-DD
- Deciders: …

## Context
## Decision
## Alternatives considered
## Consequences
```

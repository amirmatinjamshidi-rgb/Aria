# ADR-0007: OpenRouter as optional online LLM provider

- Status: Accepted
- Date: 2026-08-02
- Deciders: Chief Software Architect

## Context

Phase 1 already runs local models via Ollama (`ARIA_LLM_PROVIDER=ollama`). Operators sometimes want a stronger or different online model without changing brain orchestration. Aria is local-first (ADR-0004); cloud must stay optional, config-selected, and off by default.

## Decision

- Add `OpenRouterLlmProvider` behind `ILLMProvider` (`ARIA_LLM_PROVIDER=openrouter`).
- Use OpenRouter’s OpenAI-compatible `/chat/completions` API.
- Default model id: `nvidia/nemotron-3-ultra-550b-a55b:free` (override via `ARIA_OPENROUTER_MODEL`).
- Require `ARIA_OPENROUTER_API_KEY` only when the provider is selected; never hardcode keys.
- Keep `mock` / `echo` / `ollama` unchanged; CI and offline demos never call OpenRouter.
- `ConversationService`, personality, planner, and tools stay provider-agnostic.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Hardcode one cloud vendor SDK | Simple | Couples brain to vendor |
| Always-on cloud | Higher quality | Breaks local-first / offline |
| Proxy through Ollama cloud | One adapter | Less control; still vendor-locked |
| **OpenRouter + port** | Many models via one API; env swap | Requires API key; sends utterances off-device |

## Consequences

- Positive: swap local ↔ online with env alone; model choice is not baked into brain code.
- Positive: composition root remains the only place that knows about OpenRouter.
- Negative: online mode sends conversation content to a third party — document clearly.
- Negative: free-tier models may rate-limit or change ids; overrides stay in `.env.example`.

# ADR-0005: Ollama as primary local LLM runtime (Phase 1)

- Status: Accepted
- Date: 2026-07-29
- Deciders: Chief Software Architect

## Context

Phase 1 requires a real local `ILLMProvider` for bilingual chat and tool calling on an RTX 4060 (8 GB). ADR-0004 already chose Qwen 3 GGUF Q4. We need a serving runtime that is easy to install on Windows, exposes a stable HTTP API, and stays behind the port so llama.cpp (or cloud) can replace it later.

## Decision

- **Primary runtime:** [Ollama](https://ollama.com) behind `OllamaLlmProvider` (`ARIA_LLM_PROVIDER=ollama`).
- **Default model id:** `qwen3.5:latest` (Q4-class GGUF pulled by Ollama; override via `ARIA_OLLAMA_MODEL`).
- **API:** Ollama `/api/chat` with native tool/function calling.
- **Offline / CI:** keep `mock` and `echo` providers; never require Ollama for unit tests.
- **Fallback path:** a future `LlamaCppLlmProvider` can register under a new config id without changing `ConversationService`.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Raw llama.cpp HTTP server | Fine-grained control | More Windows friction; custom tool JSON |
| Direct Transformers JS | No sidecar | Weaker local GPU story; heavier Node process |
| Cloud-only OpenAI-compatible | Quality | Breaks local-first / offline |
| **Ollama + port** | Fast install; tool calling; swappable | Vendor API surface (mitigated by adapter) |

## Consequences

- Positive: Phase 1 demos work with one install + model pull.
- Positive: composition root remains the only place that knows about Ollama.
- Negative: tool-call JSON shapes may differ across models — adapter normalizes to `ToolCall` schema.
- Negative: model tags (`qwen3.5:latest`) may change; document overrides in `.env.example`.

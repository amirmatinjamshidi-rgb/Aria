# ADR-0009: Web search and page fetch tools

- Status: Accepted (extended by [ADR-0010](0010-tool-platform.md))
- Date: 2026-08-06
- Deciders: Chief Software Architect

## Context

Aria needs optional access to the public internet to answer live / look-up questions (news, facts outside local knowledge). Architecture already has brain tool calling (`ITool` / `IToolRegistry`). Local-first policy requires online capability to be optional, swappable, and off by default.

## Decision

- Add ports `IWebSearchProvider` and `IWebPageFetcher` in `@aria/contracts`.
- Expose two brain tools when enabled:
  - `web_search` — query → titles / URLs / snippets
  - `fetch_page` — public URL → cleaned text (no JS execution)
- Compose adapters in the brain composition root only:
  - `mock` (offline demos/tests)
  - `duckduckgo` Instant Answer API (keyless first online slice)
  - `HttpWebPageFetcher` with SSRF guards (https/http public hosts only)
- Gate registration with `ARIA_WEB_ENABLED=false` by default.
- Select search backend via `ARIA_WEB_SEARCH_PROVIDER=mock|duckduckgo`.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Vendor LLM “web browsing” | Simple | Couples cognition to one cloud vendor; breaks offline |
| Full Playwright agent browser | Handles JS sites | Heavy, slow for voice latency |
| Always-on search | Better answers | Breaks local-first / offline ladder |
| Google Custom Search | Strong ranking | Requires API key + CSE id / quota |
| **Tools + ports** | Fits hexagonal design; swappable; optional | Instant Answer depth is limited vs dedicated search APIs |

## Consequences

- Positive: brain orchestration unchanged; web is just more tools.
- Positive: offline demos keep working with mock backends.
- Negative: DuckDuckGo Instant Answer coverage is thin for some queries — Brave/Tavily/Google adapters can replace later behind the same port.
- Negative: `fetch_page` cannot render JS-heavy SPAs; document that limitation.

# ADR-0010: Tool Platform (registry, executor, search orchestration)

- Status: Accepted
- Date: 2026-08-06
- Deciders: Chief Software Architect

## Context

Phase 1 tool calling used a thin `ToolDefinition` and an in-process `ToolRegistry` that also executed tools. The conversation planner, prompt policy, and result synthesizer hard-coded tool names (`get_current_time`, `web_search`, …). That blocked scaling toward a ChatGPT + Siri + robot assistant with 100+ capabilities without editing planner/prompt code on every addition.

ADR-0009 introduced optional `web_search` / `fetch_page` behind `IWebSearchProvider`. Search needed to become provider-swappable and specialized (`search_web`, `search_wikipedia`, …) without coupling tools to DuckDuckGo.

## Decision

1. **Contracts** (`@aria/contracts`): rich `ToolMetadata` (id, category, safety, permissions, schemas, latency, examples), structured `ToolError`, `IToolCatalog`, `IToolExecutor`, `IPermissionGate` / `IPermissionStore`, `ISearchProvider` / `ISearchOrchestrator`. Legacy `IWebSearchProvider` remains as a thin adapter via `asSearchProvider`.
2. **Runtime package** (`@aria/tool-runtime`): `ToolRegistry` (discovery only), `ToolCatalog` (cached LLM projection), `ToolExecutor` (validation, permissions, confirmation, timeout, retry, metrics), `SearchOrchestrator` + routing policy, formatter registry, fakes for tests.
3. **Brain modules**: tools live under `apps/brain/src/tools/modules/*`. Registration is only in `registerBuiltinTools` — **adding a tool requires implement + register; no planner/prompt edits**.
4. **Planner**: assesses safety/feasibility and validates calls against the catalog; does not name concrete tools.
5. **Search**: specialized tools call the orchestrator; Phase 1 providers are mock, DuckDuckGo, Wikipedia; SearXNG/Brave/Bing/GitHub/docs/local are stubs. `web_search` remains a temporary alias of `search_web`.
6. **Planned stubs**: files, desktop, development, system, productivity, cooking, weather, location, media, vision, and robot tools are registered with `enabled: false` / `status: planned` so the catalog scales without unfinished adapters.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Keep planner regex → tool name map | Simple for 5 tools | Breaks Open/Closed at ~20 tools |
| Vendor “agents” SDK | Fast demos | Couples cognition to one vendor; weak offline story |
| Single `search()` tool | Fewer definitions | Planner/LLM cannot choose the right corpus |
| **Tool platform + ports** | Hexagonal, testable, 100+ ready | More packages/files upfront |

## Consequences

- Positive: new capabilities are Open/Closed; discovery is cached; errors are structured; search providers swap via config (`ARIA_SEARCH_PROVIDERS`).
- Positive: robot/vision tools can later wrap `IRobotSkill` / `IVisionProvider` without planner changes; actuators stay `CONFIRMATION_REQUIRED` / `DANGEROUS`.
- Negative: brain depends on `@aria/tool-runtime` in addition to contracts/core.
- Negative: `web_search` alias should be removed after one release once evals/prompts use `search_web`.

## Adding a tool (DX)

1. Implement `BaseTool` (or `ITool`) with `ToolMetadata` under the right module folder; optionally register an `IToolResultFormatter`.
2. Register it in `registerBuiltinTools` (or a module `register(registry)` called from there).

Do **not** edit `ConversationPlanner`, `prompt-policy.ts`, or `ConversationService` for ordinary new tools.

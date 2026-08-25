# ADR-0011: Dynamic per-user providers and API keys

## Status

Accepted (2026-08-12)

## Context

Operators need to bring their own LLM / vision backends and secrets without editing TypeScript or sharing `.env` files in git. Agents must remain swappable behind ports.

## Decision

1. Keep ports + plugin registries as the only integration surface.
2. Add `ProviderSettings` in `@aria/contracts` and `UserSettingsStore` in `@aria/core`.
3. Persist settings to `~/.aria/user-settings.json` (override with `ARIA_USER_SETTINGS_PATH`).
4. Expose `GET/PUT /api/settings/providers` on the voice web gateway.
5. Dashboard **Providers** panel edits settings; secrets are write-only in the API.
6. Apply settings by merging onto `process.env` at gateway startup (restart to apply until hot-swap lands).

## Alternatives

| Option | Pros | Cons |
|--------|------|------|
| Env-only | Simple | Poor UX; hard for non-devs |
| Cloud account store | Sync across machines | Conflicts with local-first |
| Hot-swap only | No restart | More complexity; deferred |

## Consequences

- Multiple users on one machine can use different keys via different settings paths.
- CI continues to use env / mock providers.
- Future: publish `config.providers_updated` and recreate adapters without restart.

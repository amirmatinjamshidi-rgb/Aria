# ADR-0001: Monorepo-first, multi-repo-ready

- Status: Accepted
- Date: 2026-07-29
- Deciders: Chief Software Architect

## Context

Aria is designed as a distributed system of independent services (brain, voice, memory, vision, planner, smart-home, robot-api, dashboard). The long-term vision includes splitting into multiple repositories. Early on, we are a solo (or small) team building the software brain before hardware exists.

Eleven separate repos from day one would force continuous version pinning, cross-repo CI, and publish choreography — time better spent on contracts and cognition.

## Decision

Start as a **single npm workspaces + Turborepo monorepo** (`aria`) with package boundaries that map 1:1 to future standalone repositories:

- `packages/contracts`, `packages/core`
- `apps/*` (one app per service)
- `sdk/`, `sim/`, `sidecars/`, `docs/`

**Package manager note:** The original plan preferred pnpm. On Windows without Developer Mode, pnpm fails with symlink `EPERM`. npm workspaces install via junctions/copies, so Aria defaults to **npm + Turborepo**. pnpm remains viable once Developer Mode is enabled.

Enforce dependency rules:

- Apps may import `@aria/contracts` and `@aria/core` only (not sibling apps).
- `@aria/contracts` has no Aria-internal dependencies.
- Concrete adapters are wired only in each app's **composition root**.

Split into multiple repos when Phase 7+ tooling (ROS2 / Gazebo / Isaac) makes a single Node workspace painful — not before.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Multi-repo from day 1 | Perfect isolation | Version hell for solo dev; slows Phase 0–6 |
| Single undifferentiated repo | Fastest start | No boundaries; hard to extract later |
| **Monorepo with packages** | Boundaries + speed | Requires discipline on imports |

## Consequences

- Positive: one `npm install`, shared CI, atomic cross-package refactors, clear future extraction path.
- Positive: contracts package remains sacred regardless of repo layout.
- Negative: must enforce no cross-app imports (lint/CI rule later).
- Negative: Turborepo + npm workspaces learning curve (one-time).
- Note: enable Windows Developer Mode before switching back to pnpm.

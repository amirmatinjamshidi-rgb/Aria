# Desktop / App Shell

Today Aria’s intelligence is exercised as a **local web lab** (dashboard + gateway). That is intentional: contracts stay identical when we wrap a native shell.

## Path (committed)

| Stage | Shell | Notes |
|-------|-------|-------|
| **Now** | Browser → `http://localhost:3000` | Fastest feedback; use `scripts/start-aria-web.ps1` |
| **Next** | **Tauri 2** (`apps/desktop`) | Native window loading the dashboard; spawns sidecars + gateway |
| Robot | Headless gateway + ROS2 bridge | No UI required on-device |

Electron is **not** planned — Tauri is lighter and fits local-first.

## Helper script

`scripts/start-aria-web.ps1` downloads Piper voices if missing, then starts sidecars + gateway + dashboard in separate Windows terminals.

## Tauri shell (`apps/desktop`)

Prerequisites: [Rust toolchain](https://rustup.rs/) + `npm install` at repo root.

```bash
npm run desktop:dev    # dev window → localhost:3000 (start web lab first)
npm run desktop:build  # release binary
```

The shell:

- Opens the dashboard URL (default `http://127.0.0.1:3000`)
- Does **not** duplicate business logic — same `@aria/contracts` + gateway
- Reuses `~/.aria/user-settings.json` for Providers
- Future: spawn sidecars as child processes, system tray, global PTT

Do **not** fork cognition into the shell — composition roots and the message bus stay the source of truth.

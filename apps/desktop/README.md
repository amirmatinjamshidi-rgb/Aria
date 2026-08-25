# @aria/desktop

Thin **Tauri 2** window for the Aria web lab. Loads the dashboard at `http://127.0.0.1:3000`.

## Prerequisites

- Rust toolchain ([rustup.rs](https://rustup.rs/))
- Web lab running: `scripts/start-aria-web.ps1` or manual sidecars + `voice:web` + `dashboard`

## Commands

```bash
npm install          # from repo root (includes @tauri-apps/cli)
npm run desktop:dev  # from repo root
npm run desktop:build
```

Business logic stays in `apps/voice`, `apps/brain`, and `apps/dashboard` — this package is only a native frame.

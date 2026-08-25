# Aria Documentation

| Audience | Document | Description |
|----------|----------|-------------|
| Everyone | [VISION.md](VISION.md) | End-state humanoid goal and north-star |
| Users | [USER_GUIDE.md](USER_GUIDE.md) | Run the web lab, talk, vision, providers |
| Users | [PROVIDERS.md](PROVIDERS.md) | Choose LLM / vision / TTS and API keys |
| Developers | [ARCHITECTURE.md](ARCHITECTURE.md) | Hexagonal + event-driven system design |
| Developers | [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | Repo map, DI, contracts, how to extend |
| Developers | [ROADMAP.md](ROADMAP.md) | Phases 0–12 with acceptance criteria |
| Developers | [CONTRIBUTING.md](CONTRIBUTING.md) | ADRs, tests, dependency rules |
| Operators | [BUDGET.md](BUDGET.md) | Hardware & software cost estimates |
| Operators | [BRANCHES.md](BRANCHES.md) | Review-only branch split before commit |
| Learners | [LEARNING.md](LEARNING.md) | Skills & resources parallel to phases |
| Decisions | [adrs/](adrs/) | Architecture Decision Records |
| Desktop | [DESKTOP.md](DESKTOP.md) | Web lab now; native shell options |

## Quick start (web intelligence lab)

```bash
# Terminals (from repo root)
npm run voice:sidecar
npm run vision:sidecar
npm run voice:web
npm run dashboard
```

Open http://localhost:3000 — hold **Mic**, speak Persian or English, or type. Use **Providers** to pick models and paste API keys (stored in `~/.aria/user-settings.json`).

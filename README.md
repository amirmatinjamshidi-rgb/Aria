# Aria

Modular, local-first software platform for a bilingual (Persian / English) humanoid home assistant robot.

> Software is built first. The physical robot comes later. Every AI model and hardware driver is a replaceable plugin.

## Architecture at a glance

- **Hexagonal architecture** inside each service (ports & adapters)
- **Event-driven** communication via `IMessageBus`
- **Contracts-first** — `@aria/contracts` is the only shared surface
- **TypeScript** for cognition; **Python sidecars** only for ML inference
- **ROS2** is the sole path to actuators (never from the brain)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Monorepo layout

```
packages/contracts   # Ports, schemas, events (sacred)
packages/core        # DI, bus, config, logging, plugins
apps/brain           # LLM orchestration & personality
apps/voice           # STT / TTS orchestration
apps/memory          # RAG, preferences, routines
apps/vision          # Perception + world model
apps/planner         # Behavior Trees + GOAP
apps/smart-home      # Home Assistant / MQTT / Matter
apps/robot-api       # Skills, safety, ROS2 bridge
apps/dashboard       # Next.js operator UI
sdk/                 # Public TypeScript client SDK
sim/                 # Gazebo / Isaac worlds & URDF
sidecars/            # Python inference servers
docs/                # Architecture, roadmap, ADRs
```

## Prerequisites

- Node.js ≥ 20 (npm workspaces included)
- On Windows without Developer Mode, use npm (default). pnpm needs symlink privilege.

## Quick start

```bash
npm install
npm run build
npm test

# Run the brain conversation demo (fixed script)
cp .env.example .env
npm run start -w @aria/brain

# Interactive REPL chat (type your own questions)
npm run chat -w @aria/brain
```

Swap the LLM provider without touching brain code:

```bash
# ARIA_LLM_PROVIDER=mock   (default — offline + tools)
# ARIA_LLM_PROVIDER=echo
# ARIA_LLM_PROVIDER=ollama + ARIA_OLLAMA_MODEL=qwen3.5:latest
npm run chat -w @aria/brain

# Offline quality gate + latency sample (mock by default)
npm run eval -w @aria/brain
npm run bench -w @aria/brain
```

## Documentation

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design & topology |
| [ROADMAP.md](docs/ROADMAP.md) | 13-phase delivery plan |
| [LEARNING.md](docs/LEARNING.md) | Skills roadmap |
| [BUDGET.md](docs/BUDGET.md) | Cost estimates |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Development rules |
| [docs/adrs/](docs/adrs/) | Architecture Decision Records |

## License

Proprietary for now — intended to evolve into an open-source humanoid robotics platform.

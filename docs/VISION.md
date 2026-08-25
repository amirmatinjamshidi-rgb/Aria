# Aria Vision — North Star

Aria is a **local-first, bilingual (Persian / English) humanoid home assistant**: a software platform that learns to **observe, talk, plan, walk, and help with daily physical tasks**, while controlling smart-home devices safely.

## End state (Phase 12+)

| Capability | Meaning |
|------------|---------|
| Observe | Cameras + world model; answer “what do you see?”; track people/objects |
| Talk | Hands-free STT → brain → TTS with barge-in; Persian Ganji + English voices |
| Help | Goals → BT/GOAP plans → skills on robot + Home Assistant |
| Walk | Locomotion (RL / classical) on a humanoid platform |
| Safety | Brain never owns motors; e-stop and watchdogs in `robot-api` |

## How we get there (without boiling the ocean)

1. **Web lab now** — dashboard + gateway prove intelligence (chat, voice, vision, tools).
2. **Same contracts forever** — `@aria/contracts` + ports mean later robots/sims are adapters.
3. **Hardware in phases** — wheeled base → one arm → dual arm → humanoid.
4. **Replaceable agents** — every user can pick Ollama / OpenRouter / Gemini / local YOLO and bring their own keys.

## Non-goals (for now)

- Shipping a commercial humanoid tomorrow
- Cloud-only inference as the default path
- Cross-service imports that lock you into one model vendor

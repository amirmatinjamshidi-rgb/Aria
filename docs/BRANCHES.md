# Branch map (review before you commit)

Working tree: **`wip/review-platform-improvements`** — all changes live here uncommitted until you split commits.

## Topic branches

| Branch | Purpose | Files |
|--------|---------|-------|
| `docs/master-plan` | Architecture, roadmap, guides, ADRs, budget | `.env.example`, `README.md`, `docs/**` |
| `fix/vision-429` | Gemini rate limit + scene-loop backoff | `apps/vision/.env.example`, `apps/vision/README.md`, `apps/vision/src/adapters/gemini-vision-provider.ts`, `apps/vision/src/adapters/gemini-vision-provider.test.ts`, `apps/vision/src/scene-loop.ts`, `apps/vision/src/config.ts`, `apps/vision/src/index.ts`, `docs/adrs/0013-gemini-rate-limit.md` |
| `fix/voice-overlap` | Turn FIFO queue, PTT finalize, mic capture | `apps/voice/src/voice-pipeline.ts`, `apps/voice/src/voice-pipeline.test.ts`, `apps/voice/src/gateway/web-gateway.ts`, `apps/dashboard/src/components/ChatDock.tsx`, `apps/dashboard/src/components/AriaScene.tsx`, `docs/adrs/0012-voice-turn-queue.md` |
| `feat/persian-ganji` | Ganji TTS, language detect, absolute model paths | `apps/voice/src/language.ts`, `apps/voice/src/language.test.ts`, `apps/voice/src/model-paths.ts`, `apps/voice/src/config.ts`, `apps/voice/src/adapters/piper-tts.ts`, `apps/voice/src/composition-root.ts`, `sidecars/voice/download_models.py`, `sidecars/voice/app/main.py`, `scripts/start-aria-web.ps1` |
| `feat/dynamic-providers` | User settings store, Providers UI, settings API | `packages/contracts/src/schemas/providers.ts`, `packages/contracts/src/schemas.ts`, `packages/core/src/config/user-settings.ts`, `packages/core/src/index.ts`, `apps/dashboard/src/components/SettingsPanel.tsx`, `apps/dashboard/src/lib/types.ts`, `apps/dashboard/src/app/globals.css`, `apps/voice/src/web-gateway.ts`, `docs/adrs/0011-dynamic-providers.md`, `docs/PROVIDERS.md` |
| `feat/desktop-tauri` | Tauri 2 desktop shell (after web fixes land) | `apps/desktop/**`, `docs/DESKTOP.md`, root `package.json` workspace entry |

Do **not** commit: `.env`, `~/.aria/user-settings.json`, `apps/dashboard/.next/**`.

## How to split (you run these — no agent commits)

```powershell
# Stay on wip or create topic branch from main, then restore paths per row above.
git checkout -B fix/vision-429 main
git checkout wip/review-platform-improvements -- apps/vision/.env.example apps/vision/README.md apps/vision/src/

# Repeat per branch; review with git diff; commit when ready.
```

## Suggested commit order

1. `docs/master-plan`
2. `fix/vision-429`
3. `fix/voice-overlap`
4. `feat/persian-ganji`
5. `feat/dynamic-providers`
6. `feat/desktop-tauri`

## Example commit messages

```bash
git commit -m "docs: expand user/dev guides, ADRs 0011–0013, and budget"
git commit -m "fix(vision): rate-limit Gemini and soft cooldown on 429"
git commit -m "fix(voice): FIFO turn queue, queue typed chat, PTT finalize"
git commit -m "feat(voice): Ganji Persian TTS with auto language switch"
git commit -m "feat(providers): per-user settings, TTS paths, clear API keys"
git commit -m "feat(desktop): scaffold Tauri 2 shell for local web lab"
```

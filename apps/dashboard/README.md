# @aria/dashboard

Web interaction surface for Aria: a Jarvis-inspired neural orb, live voice state, and text fallback.

The dashboard is a **pure client**. It talks to the voice web gateway over HTTP/WebSocket and does not import `@aria/brain` or `@aria/voice`.

## Features

- Full-bleed Aria presence with a Canvas neural orb (expands/shrinks with speech amplitude)
- Live pipeline states: listening → transcribing → thinking → speaking
- System mic still handled by the voice runtime (FFmpeg)
- Browser push-to-talk mic (16 kHz PCM over WebSocket)
- Always-available text input when the microphone is unavailable

## Run

Prerequisites: same as [`apps/voice`](../voice/README.md) (sidecar, FFmpeg, Piper, brain LLM).

```powershell
# Terminal 1
npm run voice:sidecar

# Terminal 2 — brain + voice + gateway (default http://127.0.0.1:8787)
npm run voice:web

# Terminal 3 — UI (http://localhost:3000)
Copy-Item apps/dashboard/.env.example apps/dashboard/.env -ErrorAction SilentlyContinue
npm run dashboard
```

Set `NEXT_PUBLIC_ARIA_GATEWAY_URL` if the gateway is not on `8787`.

On the voice side, prefer:

```env
ARIA_AUDIO_SOURCE=ffmpeg+browser
ARIA_GATEWAY_PORT=8787
```

## Architecture

See [ADR-0008](../../docs/adrs/0008-web-interaction-gateway.md).

# tiny-core kata — Learning topic 1 practice project

Practice project for **Learning roadmap §1: TypeScript Architecture & Node.js Backend**
([docs/LEARNING.md](../../docs/LEARNING.md)). You rebuild a tiny version of
`@aria/core` (DI container + message bus + plugin registry) from scratch,
test-driven: the tests are the spec, your job is to turn them green.

## Rules

1. **Do not open `packages/core` or `apps/brain` until all tests pass.**
   Afterwards, diff your solution against the real thing — that comparison
   is where most of the learning happens.
2. Do not edit anything in `test/` — the tests are the contract.
3. Keep `tsconfig.json` strict. When you finish, flip `noUnusedLocals` /
   `noUnusedParameters` back to `true` and make `npm run typecheck` pass too.

## Getting started

```bash
cd practice/tiny-core
npm install
npm run test:watch
```

All 23 tests start red. Work through them in order:

| # | File to implement | Spec | Teaches |
|---|-------------------|------|---------|
| 1 | `src/container.ts` | `test/01-container.test.ts` | DI, symbols, generics, singleton vs transient |
| 2 | `src/bus.ts` | `test/02-bus.test.ts` | pub/sub, async sequencing, discriminated unions |
| 3 | `src/registry.ts` | `test/03-registry.test.ts` | plugin pattern, open/closed principle |
| 4 | `src/app.ts` | `test/04-capstone.test.ts` | hexagonal architecture, composition root, provider swap |

`src/events.ts` is given — read it first; it mirrors how `@aria/contracts`
defines the event catalog.

## Definition of done

- `npm test` → 23/23 green
- `npm run typecheck` passes with the unused-checks re-enabled
- You can explain, out loud, why `GreeterService` never mentions
  `FormalGreeter` or `CasualGreeter` — and why the same rule means the real
  brain never mentions Ollama.

## Suggested 4–6 week plan (topic 1)

| Week | Study | Apply here / in Aria |
|------|-------|----------------------|
| 1 | TS Handbook: strict mode, narrowing, generics, `unknown` vs `any` | Exercise 1 (container) |
| 2 | Modules, NodeNext resolution, async/await & promise ordering | Exercise 2 (bus) |
| 3 | *Learning DDD* ch. on ports & adapters; hexagonal articles | Exercises 3–4 (registry + composition root) |
| 4 | Compare your kata to `packages/core` and `apps/brain`; read ADR-0001/0002 | Write down every difference and why theirs (or yours!) is better |
| 5–6 | goldbergyoni Node best practices; event-driven patterns | Stretch goals below, then start roadmap Phase 1 (Ollama adapter) |

## Stretch goals (optional)

- Add a `PersianGreeter` ("سلام Sam!") without touching `GreeterService` —
  if you have to touch it, your hexagon leaks.
- Make the bus generic over any `{ type: string }` event union instead of
  hard-coding `TinyEvent`.
- Add a `loadTinyConfig` that validates env with Zod, like
  `packages/core/src/config/load-config.ts` does.

/* eslint-disable @typescript-eslint/no-unused-vars */
import { type Container, TOKENS } from "./container.js";
import type { TinyBus } from "./bus.js";
import type { PluginMetadata } from "./registry.js";

/**
 * EXERCISE 4 (capstone) — Hexagonal composition root.
 *
 * This is the whole point of the kata: reproduce, in miniature, the
 * Phase 0 acceptance criterion of the real repo — "two providers swap
 * via an environment variable with ZERO service code changes".
 *
 * Build, in this file:
 *
 * 1. Two adapters implementing IGreetingProvider:
 *      - FormalGreeter  (id "formal"): greet("Sam") -> "Good day, Sam."
 *      - CasualGreeter  (id "casual"): greet("Sam") -> "hey Sam!"
 *
 * 2. GreeterService — the "domain" service. Constructor-injected with an
 *    IGreetingProvider and a TinyBus. On construction it subscribes to
 *    "greeting.requested" and, for each event, publishes
 *    "greeting.delivered" with the provider's text, the provider's
 *    metadata id, and the SAME correlationId. It must never know which
 *    concrete provider it holds.
 *
 * 3. createGreeterApp(env) — the ONLY place concretes are wired:
 *      - reads env.GREETER_PROVIDER ("formal" | "casual", default
 *        "formal"); unknown values throw.
 *      - registers both adapters in a TinyRegistry<IGreetingProvider>,
 *        creates the selected one, builds a TinyBus and GreeterService,
 *        registers bus/greeter in a Container under TOKENS.Bus /
 *        TOKENS.Greeter, and returns { container, bus, providerId }.
 */

/** Port: the replaceable surface. Services depend on this, never on adapters. */
export interface IGreetingProvider {
  readonly metadata: PluginMetadata;
  greet(name: string): string;
}

// TODO(you): export class FormalGreeter implements IGreetingProvider { ... }

// TODO(you): export class CasualGreeter implements IGreetingProvider { ... }

// TODO(you): export class GreeterService { ... }

export interface GreeterApp {
  readonly container: Container;
  readonly bus: TinyBus;
  readonly providerId: string;
}

export function createGreeterApp(
  env: Record<string, string | undefined>,
): GreeterApp {
  // TODO(you): implement the composition root described above.
  throw new Error("Exercise 4: createGreeterApp not implemented");
}

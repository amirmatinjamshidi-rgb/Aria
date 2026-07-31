/**
 * EXERCISE 1 — Dependency Injection container.
 *
 * Rebuild (from scratch, without looking at packages/core) a minimal
 * constructor-injection container:
 *
 *   - `register` stores a factory under a symbol token.
 *     By default registrations are singletons (created once, cached).
 *     With `{ singleton: false }` the factory runs on every resolve.
 *   - `registerInstance` stores an already-built value.
 *   - `resolve` returns the value for a token, throwing a helpful error
 *     ("No registration for token: ...") when the token is unknown.
 *   - `has` reports whether a token is registered.
 *
 * Concepts you are practicing: Map, symbols, generics, closures,
 * lazy initialization, and why a container beats `new` everywhere.
 */

export const TOKENS = {
  Config: Symbol.for("tiny.config"),
  Logger: Symbol.for("tiny.logger"),
  Bus: Symbol.for("tiny.bus"),
  Greeter: Symbol.for("tiny.greeter"),
} as const;

/** A factory receives the container so it can resolve its own dependencies. */
export type Factory<T> = (container: Container) => T;

export class Container {
  // TODO(you): pick a private data structure for registrations.

  register<T>(
    token: symbol,
    factory: Factory<T>,
    options: { singleton?: boolean } = {},
  ): this {
    // TODO(you): implement.
    throw new Error("Exercise 1: Container.register not implemented");
  }

  registerInstance<T>(token: symbol, instance: T): this {
    // TODO(you): implement.
    throw new Error("Exercise 1: Container.registerInstance not implemented");
  }

  resolve<T>(token: symbol): T {
    // TODO(you): implement (remember singleton caching).
    throw new Error("Exercise 1: Container.resolve not implemented");
  }

  has(token: symbol): boolean {
    // TODO(you): implement.
    throw new Error("Exercise 1: Container.has not implemented");
  }
}

import type { Handler, TinyEvent, TinyEventType } from "./events.js";

/**
 * EXERCISE 2 — In-process message bus.
 *
 * Rebuild a minimal publish/subscribe bus:
 *
 *   - `subscribe(type, handler)` registers a handler for one event type,
 *     or for every event when type is "*". It returns an unsubscribe
 *     function that removes exactly that handler.
 *   - `publish(event)` invokes every matching handler IN SUBSCRIPTION
 *     ORDER and awaits each one (handlers may be async).
 *   - A handler that throws must not prevent later handlers from running;
 *     collect the errors and, after all handlers ran, reject with the
 *     first one.
 *   - `dispose()` drops all handlers.
 *
 * Concepts you are practicing: async/await sequencing, closures for
 * unsubscribe, discriminated unions, and why services never call each
 * other directly in Aria — they talk through this contract.
 */
export class TinyBus {
  // TODO(you): pick a private data structure for handler entries.

  subscribe<T extends TinyEvent = TinyEvent>(
    type: TinyEventType | "*",
    handler: Handler<T>,
  ): () => void {
    // TODO(you): implement.
    throw new Error("Exercise 2: TinyBus.subscribe not implemented");
  }

  async publish(event: TinyEvent): Promise<void> {
    // TODO(you): implement.
    throw new Error("Exercise 2: TinyBus.publish not implemented");
  }

  async dispose(): Promise<void> {
    // TODO(you): implement.
    throw new Error("Exercise 2: TinyBus.dispose not implemented");
  }
}

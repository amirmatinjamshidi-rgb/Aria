/**
 * EXERCISE 3 — Plugin registry.
 *
 * Rebuild the registry that lets composition roots pick an adapter by id:
 *
 *   - `register(metadata, factory)` maps `metadata.id` to the factory and
 *     throws "Plugin already registered: <id>" on duplicates.
 *   - `has(id)` / `list()` inspect registrations (list returns metadata
 *     in registration order).
 *   - `create(id)` runs the factory (which may be async) and returns the
 *     instance; unknown ids throw an error naming the available ids:
 *     'Unknown plugin "<id>". Available: a, b' (or "(none)").
 *
 * Concepts you are practicing: generics over a plugin type, factories
 * vs instances, and the open/closed principle — new adapters are added
 * by registering, never by editing consumers.
 */

export interface PluginMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

export type PluginFactory<T> = () => T | Promise<T>;

export class TinyRegistry<T> {
  // TODO(you): pick a private data structure.

  register(metadata: PluginMetadata, factory: PluginFactory<T>): this {
    // TODO(you): implement.
    throw new Error("Exercise 3: TinyRegistry.register not implemented");
  }

  has(id: string): boolean {
    // TODO(you): implement.
    throw new Error("Exercise 3: TinyRegistry.has not implemented");
  }

  list(): PluginMetadata[] {
    // TODO(you): implement.
    throw new Error("Exercise 3: TinyRegistry.list not implemented");
  }

  async create(id: string): Promise<T> {
    // TODO(you): implement.
    throw new Error("Exercise 3: TinyRegistry.create not implemented");
  }
}

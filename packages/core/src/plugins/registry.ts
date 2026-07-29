import type { PluginFactory, PluginMetadata } from "@aria/contracts";

export interface RegisteredPlugin<T> {
  readonly metadata: PluginMetadata;
  readonly factory: PluginFactory<T>;
}

/**
 * Registry that maps provider ids to factories.
 * Composition roots select which plugin to activate from config.
 */
export class PluginRegistry<T> {
  private readonly plugins = new Map<string, RegisteredPlugin<T>>();

  register(metadata: PluginMetadata, factory: PluginFactory<T>): this {
    if (this.plugins.has(metadata.id)) {
      throw new Error(`Plugin already registered: ${metadata.id}`);
    }
    this.plugins.set(metadata.id, { metadata, factory });
    return this;
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  list(): PluginMetadata[] {
    return [...this.plugins.values()].map((p) => p.metadata);
  }

  async create(id: string): Promise<T> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      const available = [...this.plugins.keys()].join(", ") || "(none)";
      throw new Error(
        `Unknown plugin "${id}". Available: ${available}`,
      );
    }
    return plugin.factory();
  }
}

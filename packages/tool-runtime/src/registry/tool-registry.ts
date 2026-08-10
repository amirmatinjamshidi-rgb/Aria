import type {
  ITool,
  IToolRegistry,
  ToolCatalogSnapshot,
  ToolDefinition,
  ToolMetadata,
} from "@aria/contracts";
import { toLlmToolDefinition } from "@aria/contracts";

/**
 * In-process tool registry — registration and discovery only.
 * Execution lives in ToolExecutor.
 */
export class ToolRegistry implements IToolRegistry {
  private readonly byName = new Map<string, ITool>();
  private readonly byId = new Map<string, ITool>();
  private version = 0;

  register(tool: ITool): void {
    const { name, id } = tool.metadata;
    if (this.byName.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    if (this.byId.has(id)) {
      throw new Error(`Tool id already registered: ${id}`);
    }
    this.byName.set(name, tool);
    this.byId.set(id, tool);
    this.version += 1;
  }

  get(name: string): ITool | undefined {
    return this.byName.get(name);
  }

  getById(id: string): ITool | undefined {
    return this.byId.get(id);
  }

  list(): readonly ITool[] {
    return [...this.byName.values()];
  }

  listMetadata(options?: {
    readonly enabledOnly?: boolean;
    readonly includePlanned?: boolean;
  }): readonly ToolMetadata[] {
    const enabledOnly = options?.enabledOnly ?? false;
    const includePlanned = options?.includePlanned ?? true;
    return this.list()
      .map((t) => t.metadata)
      .filter((m) => {
        if (enabledOnly && !m.enabled) return false;
        if (!includePlanned && m.status === "planned") return false;
        return true;
      });
  }

  listDefinitions(options?: {
    readonly enabledOnly?: boolean;
  }): readonly ToolDefinition[] {
    return this.listMetadata({
      enabledOnly: options?.enabledOnly ?? true,
      includePlanned: false,
    })
      .filter((m) => m.status === "active" || m.status === "deprecated")
      .map((m) => toLlmToolDefinition(m));
  }

  snapshot(): ToolCatalogSnapshot {
    const tools = this.listMetadata({ includePlanned: true });
    return {
      version: this.version,
      tools,
      definitions: tools
        .filter((m) => m.enabled && m.status === "active")
        .map((m) => toLlmToolDefinition(m)),
    };
  }

  getVersion(): number {
    return this.version;
  }
}

import type {
  IToolCatalog,
  IToolRegistry,
  PermissionId,
  ToolDefinition,
  ToolMetadata,
} from "@aria/contracts";
import { toLlmToolDefinition } from "@aria/contracts";

function hasPermissions(
  tool: ToolMetadata,
  permissions?: ReadonlySet<PermissionId>,
): boolean {
  if (!permissions || tool.permissions.length === 0) {
    return true;
  }
  return tool.permissions.every((p) => permissions.has(p));
}

/**
 * Cached discovery view. Call refresh() after registry mutations
 * (composition root typically refreshes once after all registrations).
 */
export class ToolCatalog implements IToolCatalog {
  private cached: readonly ToolMetadata[] = [];
  private _version = 0;

  constructor(private readonly registry: IToolRegistry) {
    this.refresh();
  }

  get version(): number {
    return this._version;
  }

  refresh(): void {
    const snap = this.registry.snapshot();
    this.cached = snap.tools;
    this._version = snap.version;
  }

  metadataForLlm(options?: {
    readonly permissions?: ReadonlySet<PermissionId>;
    readonly enabledOnly?: boolean;
  }): readonly ToolMetadata[] {
    const enabledOnly = options?.enabledOnly ?? true;
    return this.cached.filter((m) => {
      if (enabledOnly && (!m.enabled || m.status !== "active")) return false;
      return hasPermissions(m, options?.permissions);
    });
  }

  definitionsForLlm(options?: {
    readonly permissions?: ReadonlySet<PermissionId>;
    readonly enabledOnly?: boolean;
  }): readonly ToolDefinition[] {
    return this.metadataForLlm(options).map((m) => toLlmToolDefinition(m));
  }

  byName(name: string): ToolMetadata | undefined {
    return this.cached.find((m) => m.name === name);
  }

  byCategory(category: string): readonly ToolMetadata[] {
    return this.cached.filter((m) => m.category === category);
  }

  byTag(tag: string): readonly ToolMetadata[] {
    return this.cached.filter((m) => m.tags.includes(tag));
  }

  toPromptGuidance(options?: {
    readonly permissions?: ReadonlySet<PermissionId>;
    readonly maxTools?: number;
  }): string {
    const max = options?.maxTools ?? 40;
    const tools = this.metadataForLlm({
      permissions: options?.permissions,
      enabledOnly: true,
    }).slice(0, max);

    if (tools.length === 0) {
      return "";
    }

    const lines = tools.map(
      (t) => `- ${t.name} (${t.category}): ${t.description}`,
    );
    return ["Available tools:", ...lines].join("\n");
  }
}

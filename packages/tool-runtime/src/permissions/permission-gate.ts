import type {
  IConfirmationGate,
  IPermissionGate,
  IPermissionStore,
  PermissionId,
  ToolError,
  ToolExecutionContext,
  ToolMetadata,
} from "@aria/contracts";
import { createToolError } from "@aria/contracts";

const DEFAULT_USER = "__default__";

export class InMemoryPermissionStore implements IPermissionStore {
  private readonly grants = new Map<string, Set<PermissionId>>();

  constructor(initial?: readonly PermissionId[], userId?: string) {
    if (initial) {
      for (const p of initial) {
        this.grant(p, userId);
      }
    }
  }

  getGranted(userId?: string): ReadonlySet<PermissionId> {
    return this.grants.get(userId ?? DEFAULT_USER) ?? new Set();
  }

  grant(permission: PermissionId, userId?: string): void {
    const key = userId ?? DEFAULT_USER;
    let set = this.grants.get(key);
    if (!set) {
      set = new Set();
      this.grants.set(key, set);
    }
    set.add(permission);
  }

  revoke(permission: PermissionId, userId?: string): void {
    this.grants.get(userId ?? DEFAULT_USER)?.delete(permission);
  }
}

export class PermissionGate implements IPermissionGate {
  assertAllowed(
    tool: ToolMetadata,
    context: ToolExecutionContext,
  ): ToolError | undefined {
    if (tool.permissions.length === 0) {
      return undefined;
    }
    for (const permission of tool.permissions) {
      if (!context.grantedPermissions.has(permission)) {
        return createToolError(
          "PERMISSION_DENIED",
          `Permission "${permission}" is required for tool "${tool.name}"`,
        );
      }
    }
    return undefined;
  }
}

export class ConfirmationGate implements IConfirmationGate {
  assertConfirmed(
    tool: ToolMetadata,
    context: ToolExecutionContext,
  ): ToolError | undefined {
    if (
      tool.safety !== "CONFIRMATION_REQUIRED" &&
      tool.safety !== "DANGEROUS"
    ) {
      return undefined;
    }
    if (context.confirmationToken && context.confirmationToken.length > 0) {
      return undefined;
    }
    return createToolError(
      "CONFIRMATION_REQUIRED",
      `Tool "${tool.name}" requires user confirmation before execution`,
    );
  }
}

/** Default permissions for a local assistant session. */
export function defaultGrantedPermissions(options?: {
  readonly webEnabled?: boolean;
}): PermissionId[] {
  const perms: PermissionId[] = [
    "time.read",
    "memory.read",
    "memory.write",
    "smarthome.light",
  ];
  if (options?.webEnabled) {
    perms.push("search.web", "search.fetch", "search.wikipedia");
  }
  return perms;
}

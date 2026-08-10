import type { ToolMetadata } from "@aria/contracts";

/** Helper to build ToolMetadata with common defaults. */
export function defineToolMeta(
  partial: Omit<ToolMetadata, "tags" | "examples" | "outputSchema" | "version" | "enabled" | "status" | "concurrent" | "estimatedLatencyMs" | "timeoutMs" | "safety" | "permissions"> &
    Partial<
      Pick<
        ToolMetadata,
        | "tags"
        | "examples"
        | "outputSchema"
        | "version"
        | "enabled"
        | "status"
        | "concurrent"
        | "estimatedLatencyMs"
        | "timeoutMs"
        | "safety"
        | "permissions"
      >
    >,
): ToolMetadata {
  return {
    version: "1.0.0",
    tags: [],
    examples: [],
    outputSchema: { type: "object", properties: {} },
    enabled: true,
    status: "active",
    concurrent: true,
    estimatedLatencyMs: 100,
    timeoutMs: 15_000,
    safety: "SAFE",
    permissions: [],
    ...partial,
  };
}

export function plannedStubMeta(
  id: string,
  name: string,
  category: ToolMetadata["category"],
  description: string,
  permissions: string[] = [],
  safety: ToolMetadata["safety"] = "SAFE",
): ToolMetadata {
  return defineToolMeta({
    id,
    name,
    category,
    description,
    permissions,
    safety,
    enabled: false,
    status: "planned",
    inputSchema: { type: "object", properties: {} },
  });
}

import { z } from "zod";

/** Known tool categories; open string allowed for extension. */
export const KnownToolCategorySchema = z.enum([
  "Memory",
  "Time",
  "Search",
  "Files",
  "Desktop",
  "Git",
  "Development",
  "SmartHome",
  "Cooking",
  "Media",
  "Weather",
  "Location",
  "Robot",
  "Vision",
  "Ocr",
  "System",
  "Diagnostics",
  "Health",
  "Shopping",
  "Calendar",
  "Communication",
]);
export type KnownToolCategory = z.infer<typeof KnownToolCategorySchema>;

export const ToolCategorySchema = z.union([
  KnownToolCategorySchema,
  z.string().min(1),
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export const SafetyLevelSchema = z.enum([
  "SAFE",
  "CONFIRMATION_REQUIRED",
  "DANGEROUS",
  "PRIVATE",
]);
export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

export const ToolStatusSchema = z.enum(["active", "planned", "deprecated"]);
export type ToolStatus = z.infer<typeof ToolStatusSchema>;

export const PermissionIdSchema = z.string().min(1);
export type PermissionId = z.infer<typeof PermissionIdSchema>;

/** JSON-Schema object used for LLM tool parameters and Zod validation. */
export const JsonSchemaObjectSchema = z
  .record(z.unknown())
  .default({ type: "object", properties: {} });
export type JsonSchemaObject = z.infer<typeof JsonSchemaObjectSchema>;

export const ToolExampleSchema = z.object({
  description: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  output: z.unknown().optional(),
});
export type ToolExample = z.infer<typeof ToolExampleSchema>;

export const ToolMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1).default("1.0.0"),
  description: z.string().min(1),
  category: ToolCategorySchema,
  tags: z.array(z.string()).default([]),
  safety: SafetyLevelSchema.default("SAFE"),
  permissions: z.array(PermissionIdSchema).default([]),
  inputSchema: JsonSchemaObjectSchema,
  outputSchema: JsonSchemaObjectSchema.default({
    type: "object",
    properties: {},
  }),
  timeoutMs: z.number().int().positive().default(15_000),
  estimatedLatencyMs: z.number().int().nonnegative().default(100),
  examples: z.array(ToolExampleSchema).default([]),
  enabled: z.boolean().default(true),
  status: ToolStatusSchema.default("active"),
  concurrent: z.boolean().default(true),
});
export type ToolMetadata = z.infer<typeof ToolMetadataSchema>;

export const ToolErrorCodeSchema = z.enum([
  "VALIDATION",
  "TIMEOUT",
  "CANCELLED",
  "PERMISSION_DENIED",
  "CONFIRMATION_REQUIRED",
  "PROVIDER",
  "NOT_FOUND",
  "INTERNAL",
]);
export type ToolErrorCode = z.infer<typeof ToolErrorCodeSchema>;

export const ToolErrorSchema = z.object({
  code: ToolErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().default(false),
  details: z.record(z.unknown()).optional(),
});
export type ToolError = z.infer<typeof ToolErrorSchema>;

export const ToolMetricSampleSchema = z.object({
  toolName: z.string(),
  latencyMs: z.number().nonnegative(),
  ok: z.boolean(),
  errorCode: ToolErrorCodeSchema.optional(),
  timestamp: z.string().datetime(),
  correlationId: z.string().optional(),
});
export type ToolMetricSample = z.infer<typeof ToolMetricSampleSchema>;

export const PlannerDecisionTraceSchema = z.object({
  correlationId: z.string(),
  catalogVersion: z.number().int().nonnegative(),
  accepted: z.array(z.string()),
  rejected: z.array(
    z.object({
      name: z.string(),
      code: z.string(),
      reason: z.string(),
    }),
  ),
  timestamp: z.string().datetime(),
});
export type PlannerDecisionTrace = z.infer<typeof PlannerDecisionTraceSchema>;

/** Project rich metadata to the LLM-facing ToolDefinition shape. */
export function toLlmToolDefinition(meta: ToolMetadata): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: meta.name,
    description: meta.description,
    parameters: meta.inputSchema,
  };
}

export function createToolError(
  code: ToolErrorCode,
  message: string,
  options: { retryable?: boolean; details?: Record<string, unknown> } = {},
): ToolError {
  return {
    code,
    message,
    retryable: options.retryable ?? false,
    details: options.details,
  };
}

export function toolErrorMessage(error: ToolError | string | undefined): string {
  if (!error) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return error.message;
}

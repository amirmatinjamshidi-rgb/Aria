import type {
  LanguageCode,
  PlannerDecisionTrace,
  PermissionId,
  SearchDomain,
  SearchIntent,
  SearchQuery,
  SearchResponse,
  ToolCall,
  ToolDefinition,
  ToolError,
  ToolMetadata,
  ToolMetricSample,
  ToolResult,
} from "../schemas.js";

export type { ToolDefinition, ToolMetadata, ToolError };

export interface ToolExecutionContext {
  readonly correlationId: string;
  readonly language?: LanguageCode;
  readonly signal?: AbortSignal;
  readonly userId?: string;
  readonly grantedPermissions: ReadonlySet<PermissionId>;
  readonly confirmationToken?: string;
}

/**
 * Port: A single callable tool registered with the brain tool registry.
 */
export interface ITool {
  readonly metadata: ToolMetadata;
  /** LLM projection derived from metadata (kept for provider adapters). */
  readonly definition: ToolDefinition;
  execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown>;
}

export interface ToolCatalogSnapshot {
  readonly version: number;
  readonly tools: readonly ToolMetadata[];
  readonly definitions: readonly ToolDefinition[];
}

/**
 * Port: Tool registration and discovery (does not execute).
 */
export interface IToolRegistry {
  register(tool: ITool): void;
  get(name: string): ITool | undefined;
  getById(id: string): ITool | undefined;
  list(): readonly ITool[];
  listMetadata(options?: {
    readonly enabledOnly?: boolean;
    readonly includePlanned?: boolean;
  }): readonly ToolMetadata[];
  listDefinitions(options?: {
    readonly enabledOnly?: boolean;
  }): readonly ToolDefinition[];
  snapshot(): ToolCatalogSnapshot;
}

/**
 * Port: Cached immutable discovery view for LLM + planner.
 */
export interface IToolCatalog {
  readonly version: number;
  refresh(): void;
  definitionsForLlm(options?: {
    readonly permissions?: ReadonlySet<PermissionId>;
    readonly enabledOnly?: boolean;
  }): readonly ToolDefinition[];
  metadataForLlm(options?: {
    readonly permissions?: ReadonlySet<PermissionId>;
    readonly enabledOnly?: boolean;
  }): readonly ToolMetadata[];
  byName(name: string): ToolMetadata | undefined;
  byCategory(category: string): readonly ToolMetadata[];
  byTag(tag: string): readonly ToolMetadata[];
  toPromptGuidance(options?: {
    readonly permissions?: ReadonlySet<PermissionId>;
    readonly maxTools?: number;
  }): string;
}

export interface IToolExecutor {
  execute(
    toolCall: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolResult>;
  executeMany(
    toolCalls: readonly ToolCall[],
    context: ToolExecutionContext,
  ): Promise<readonly ToolResult[]>;
}

export interface IToolResultFormatter {
  readonly toolName: string;
  format(result: ToolResult, language: LanguageCode): string;
}

export interface IToolResultFormatterRegistry {
  register(formatter: IToolResultFormatter): void;
  get(toolName: string): IToolResultFormatter | undefined;
}

export interface IToolResultSynthesizer {
  synthesize(result: ToolResult, language: LanguageCode): string;
  looksLikeRawToolDump(text: string): boolean;
}

export interface IPermissionStore {
  getGranted(userId?: string): ReadonlySet<PermissionId>;
  grant(permission: PermissionId, userId?: string): void;
  revoke(permission: PermissionId, userId?: string): void;
}

export interface IPermissionGate {
  assertAllowed(
    tool: ToolMetadata,
    context: ToolExecutionContext,
  ): ToolError | undefined;
}

export interface IConfirmationGate {
  assertConfirmed(
    tool: ToolMetadata,
    context: ToolExecutionContext,
  ): ToolError | undefined;
}

export interface IToolMetrics {
  record(sample: ToolMetricSample): void;
  snapshot(): {
    readonly total: number;
    readonly success: number;
    readonly failure: number;
    readonly timeouts: number;
    readonly byTool: ReadonlyMap<
      string,
      { success: number; failure: number; totalLatencyMs: number }
    >;
  };
}

export interface IDecisionTraceWriter {
  write(trace: PlannerDecisionTrace): void;
}

export interface CategoryDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export interface ICategoryRegistry {
  register(category: CategoryDescriptor): void;
  list(): readonly CategoryDescriptor[];
  get(id: string): CategoryDescriptor | undefined;
}

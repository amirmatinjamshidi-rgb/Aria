import type {
  IConfirmationGate,
  IPermissionGate,
  ITool,
  IToolExecutor,
  IToolMetrics,
  IToolRegistry,
  ToolCall,
  ToolError,
  ToolExecutionContext,
  ToolResult,
} from "@aria/contracts";
import { createToolError } from "@aria/contracts";
import { toToolError } from "../errors/to-tool-error.js";
import { delay, DEFAULT_RETRY_POLICY, shouldRetry, type RetryPolicy } from "./retry-policy.js";
import { withTimeout } from "./timeout.js";
import { validateToolArgs } from "./validation.js";

export interface ToolExecutorOptions {
  readonly registry: IToolRegistry;
  readonly permissionGate?: IPermissionGate;
  readonly confirmationGate?: IConfirmationGate;
  readonly metrics?: IToolMetrics;
  readonly retryPolicy?: RetryPolicy;
}

export class ToolExecutor implements IToolExecutor {
  private readonly registry: IToolRegistry;
  private readonly permissionGate?: IPermissionGate;
  private readonly confirmationGate?: IConfirmationGate;
  private readonly metrics?: IToolMetrics;
  private readonly retryPolicy: RetryPolicy;

  constructor(options: ToolExecutorOptions) {
    this.registry = options.registry;
    this.permissionGate = options.permissionGate;
    this.confirmationGate = options.confirmationGate;
    this.metrics = options.metrics;
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
  }

  async execute(
    toolCall: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const started = Date.now();
    const tool = this.registry.get(toolCall.name);
    if (!tool) {
      return this.fail(
        toolCall,
        createToolError("NOT_FOUND", `Unknown tool: ${toolCall.name}`),
        started,
        context,
      );
    }

    if (!tool.metadata.enabled || tool.metadata.status === "planned") {
      return this.fail(
        toolCall,
        createToolError(
          "PROVIDER",
          `Tool "${toolCall.name}" is not enabled`,
        ),
        started,
        context,
      );
    }

    const permError = this.permissionGate?.assertAllowed(tool.metadata, context);
    if (permError) {
      return this.fail(toolCall, permError, started, context);
    }

    const confirmError = this.confirmationGate?.assertConfirmed(
      tool.metadata,
      context,
    );
    if (confirmError) {
      return this.fail(toolCall, confirmError, started, context);
    }

    const validated = validateToolArgs(tool.metadata.inputSchema, toolCall.arguments);
    if (!validated.ok) {
      return this.fail(
        toolCall,
        createToolError("VALIDATION", validated.message),
        started,
        context,
      );
    }

    let attempt = 0;
    let lastError: ToolError | undefined;

    while (attempt < Math.max(1, this.retryPolicy.maxAttempts)) {
      attempt += 1;
      try {
        const result = await withTimeout(
          tool.execute(validated.data, {
            ...context,
            signal: context.signal,
          }),
          tool.metadata.timeoutMs,
          context.signal,
        );
        this.record(toolCall.name, true, started, context);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          result,
        };
      } catch (error: unknown) {
        lastError = mapAbort(error);
        if (!shouldRetry(lastError, attempt, this.retryPolicy)) {
          break;
        }
        await delay(this.retryPolicy.baseDelayMs * attempt, context.signal);
      }
    }

    return this.fail(
      toolCall,
      lastError ?? createToolError("INTERNAL", "Tool failed"),
      started,
      context,
    );
  }

  async executeMany(
    toolCalls: readonly ToolCall[],
    context: ToolExecutionContext,
  ): Promise<readonly ToolResult[]> {
    const allConcurrent = toolCalls.every((call) => {
      const tool = this.registry.get(call.name);
      return (
        tool?.metadata.concurrent === true &&
        tool.metadata.safety === "SAFE"
      );
    });

    if (allConcurrent && toolCalls.length > 1) {
      return Promise.all(toolCalls.map((c) => this.execute(c, context)));
    }

    const results: ToolResult[] = [];
    for (const call of toolCalls) {
      results.push(await this.execute(call, context));
    }
    return results;
  }

  private fail(
    toolCall: ToolCall,
    error: ToolError,
    started: number,
    context: ToolExecutionContext,
  ): ToolResult {
    this.record(toolCall.name, false, started, context, error.code);
    return {
      toolCallId: toolCall.id,
      name: toolCall.name,
      ok: false,
      error,
    };
  }

  private record(
    toolName: string,
    ok: boolean,
    started: number,
    context: ToolExecutionContext,
    errorCode?: ToolError["code"],
  ): void {
    this.metrics?.record({
      toolName,
      latencyMs: Date.now() - started,
      ok,
      errorCode,
      timestamp: new Date().toISOString(),
      correlationId: context.correlationId,
    });
  }
}

function mapAbort(error: unknown): ToolError {
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "AbortError"
  ) {
    const timedOut =
      "timedOut" in error && Boolean((error as { timedOut?: boolean }).timedOut);
    if (timedOut) {
      return createToolError("TIMEOUT", "Tool execution timed out", {
        retryable: true,
      });
    }
    return createToolError("CANCELLED", "Tool execution was cancelled");
  }
  return toToolError(error);
}

/** @internal exposed for tests */
export type { ITool };

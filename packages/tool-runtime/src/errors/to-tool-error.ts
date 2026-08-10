import {
  createToolError,
  type ToolError,
  type ToolErrorCode,
} from "@aria/contracts";

export class ToolExecutionError extends Error {
  readonly toolError: ToolError;

  constructor(toolError: ToolError) {
    super(toolError.message);
    this.name = "ToolExecutionError";
    this.toolError = toolError;
  }
}

export function isToolExecutionError(error: unknown): error is ToolExecutionError {
  return error instanceof ToolExecutionError;
}

export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolExecutionError) {
    return error.toolError;
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as ToolError).code === "string" &&
    typeof (error as ToolError).message === "string"
  ) {
    return error as ToolError;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("aborted")) {
      return createToolError("CANCELLED", "Tool execution was cancelled", {
        retryable: false,
      });
    }
    return createToolError("INTERNAL", error.message, { retryable: false });
  }
  return createToolError("INTERNAL", String(error), { retryable: false });
}

export function throwToolError(
  code: ToolErrorCode,
  message: string,
  options?: { retryable?: boolean; details?: Record<string, unknown> },
): never {
  throw new ToolExecutionError(createToolError(code, message, options));
}

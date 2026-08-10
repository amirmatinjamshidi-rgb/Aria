import type { ToolError } from "@aria/contracts";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  baseDelayMs: 50,
};

export function shouldRetry(error: ToolError, attempt: number, policy: RetryPolicy): boolean {
  if (!error.retryable) return false;
  return attempt < policy.maxAttempts;
}

export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

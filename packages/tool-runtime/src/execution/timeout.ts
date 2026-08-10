export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  const onOuterAbort = () => timeoutController.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted || timeoutController.signal.aborted) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
      reject(Object.assign(new Error("Tool execution timed out or cancelled"), { name: "AbortError" }));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
      const timedOut = !signal?.aborted;
      reject(
        Object.assign(
          new Error(timedOut ? "Tool execution timed out" : "Tool execution was cancelled"),
          { name: "AbortError", timedOut },
        ),
      );
    };

    timeoutController.signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onOuterAbort);
        timeoutController.signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onOuterAbort);
        timeoutController.signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

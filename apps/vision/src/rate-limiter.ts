/**
 * Token bucket rate limiter.
 *
 * The Gemini free tier answers 429 rather than queuing, and a 429 costs a full
 * round trip plus a backoff window. Shaping requests client-side is strictly
 * cheaper than discovering the limit server-side, so every Gemini call takes a
 * token first.
 */

export interface TokenBucketOptions {
  /** Burst size. 1 means strictly one request per refill interval. */
  readonly capacity?: number;
  /** Time to regenerate a single token. */
  readonly refillIntervalMs: number;
  /** Injectable clock/sleep for deterministic tests. */
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TokenBucket {
  private readonly capacity: number;
  private readonly refillIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  /**
   * Credit is tracked in milliseconds rather than fractional tokens: one token
   * costs `refillIntervalMs`. With an integer-millisecond clock all arithmetic
   * stays exact, so `delayMs()` never over-waits and `acquire` never needs a
   * second sleep because a float landed a hair below one whole token.
   */
  private creditMs: number;
  private lastRefillAt: number;
  /** Hard block from a server-side 429, independent of token accounting. */
  private blockedUntil = 0;

  constructor(options: TokenBucketOptions) {
    if (!(options.refillIntervalMs > 0)) {
      throw new Error("TokenBucket requires a positive refillIntervalMs");
    }
    this.capacity = Math.max(1, options.capacity ?? 1);
    this.refillIntervalMs = options.refillIntervalMs;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
    this.creditMs = this.capacity * this.refillIntervalMs;
    this.lastRefillAt = this.now();
  }

  /** Milliseconds until a token is available; 0 when one can be taken now. */
  delayMs(): number {
    this.refill();
    const blockedFor = Math.max(0, this.blockedUntil - this.now());
    const tokenWait = Math.max(0, this.refillIntervalMs - this.creditMs);
    return Math.max(blockedFor, tokenWait);
  }

  /** Take a token if one is free right now. */
  tryAcquire(): boolean {
    if (this.delayMs() > 0) {
      return false;
    }
    this.creditMs -= this.refillIntervalMs;
    return true;
  }

  /** Wait for a token, then take it. */
  async acquire(): Promise<void> {
    for (;;) {
      const wait = this.delayMs();
      if (wait === 0) {
        this.creditMs -= this.refillIntervalMs;
        return;
      }
      // Re-check after sleeping: a concurrent caller may have taken the token.
      await this.sleep(wait);
    }
  }

  /**
   * Refuse tokens for `ms`, e.g. because the server returned 429 with a
   * Retry-After. Extends an existing block rather than shortening it.
   */
  blockFor(ms: number): void {
    if (!(ms > 0)) {
      return;
    }
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
  }

  private refill(): void {
    const now = this.now();
    const elapsed = now - this.lastRefillAt;
    if (elapsed <= 0) {
      return;
    }
    this.lastRefillAt = now;
    this.creditMs = Math.min(
      this.capacity * this.refillIntervalMs,
      this.creditMs + elapsed,
    );
  }
}

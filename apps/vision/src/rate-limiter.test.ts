import { describe, expect, it } from "vitest";
import { TokenBucket } from "./rate-limiter.js";

/** Deterministic clock whose only way to advance is an awaited sleep. */
function fakeClock(): {
  bucket: (refillIntervalMs: number, capacity?: number) => TokenBucket;
  advance: (ms: number) => void;
  slept: number[];
} {
  let time = 1_000;
  const slept: number[] = [];
  return {
    slept,
    advance: (ms: number) => {
      time += ms;
    },
    bucket: (refillIntervalMs, capacity) =>
      new TokenBucket({
        capacity,
        refillIntervalMs,
        now: () => time,
        sleep: async (ms) => {
          slept.push(ms);
          time += ms;
        },
      }),
  };
}

describe("TokenBucket", () => {
  it("rejects a non-positive refill interval", () => {
    expect(() => new TokenBucket({ refillIntervalMs: 0 })).toThrow();
  });

  it("allows the first request immediately", () => {
    const clock = fakeClock();
    expect(clock.bucket(4500).tryAcquire()).toBe(true);
  });

  it("enforces one request per interval", () => {
    const clock = fakeClock();
    const bucket = clock.bucket(4500);

    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(false);

    clock.advance(4499);
    expect(bucket.tryAcquire()).toBe(false);

    clock.advance(1);
    expect(bucket.tryAcquire()).toBe(true);
  });

  it("reports the remaining wait", () => {
    const clock = fakeClock();
    const bucket = clock.bucket(4500);
    bucket.tryAcquire();

    expect(bucket.delayMs()).toBe(4500);
    clock.advance(1500);
    expect(bucket.delayMs()).toBe(3000);
  });

  it("credits partially elapsed intervals instead of rounding them away", () => {
    const clock = fakeClock();
    const bucket = clock.bucket(1000);
    bucket.tryAcquire();

    // Three 400 ms steps add up to 1.2 tokens, so the third must succeed.
    clock.advance(400);
    expect(bucket.tryAcquire()).toBe(false);
    clock.advance(400);
    expect(bucket.tryAcquire()).toBe(false);
    clock.advance(400);
    expect(bucket.tryAcquire()).toBe(true);
  });

  it("sleeps until a token frees up when acquiring", async () => {
    const clock = fakeClock();
    const bucket = clock.bucket(4500);

    await bucket.acquire();
    expect(clock.slept).toEqual([]);

    await bucket.acquire();
    expect(clock.slept).toEqual([4500]);
  });

  it("paces a burst of acquires to the configured rate", async () => {
    const clock = fakeClock();
    const bucket = clock.bucket(4500);

    for (let index = 0; index < 4; index += 1) {
      await bucket.acquire();
    }

    // First is free, each of the other three waits a full interval.
    expect(clock.slept).toEqual([4500, 4500, 4500]);
  });

  it("allows a burst up to capacity then throttles", () => {
    const clock = fakeClock();
    const bucket = clock.bucket(1000, 3);

    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(false);
  });

  it("never accumulates more than capacity while idle", () => {
    const clock = fakeClock();
    const bucket = clock.bucket(1000, 2);

    clock.advance(60_000);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(false);
  });

  it("blocks for the full penalty after a 429", () => {
    const clock = fakeClock();
    const bucket = clock.bucket(1000);

    bucket.blockFor(30_000);
    expect(bucket.delayMs()).toBe(30_000);

    // Tokens refill during the block but the block still wins.
    clock.advance(5_000);
    expect(bucket.tryAcquire()).toBe(false);
    expect(bucket.delayMs()).toBe(25_000);

    clock.advance(25_000);
    expect(bucket.tryAcquire()).toBe(true);
  });

  it("extends but never shortens an active block", () => {
    const clock = fakeClock();
    const bucket = clock.bucket(1000);

    bucket.blockFor(30_000);
    bucket.blockFor(5_000);
    expect(bucket.delayMs()).toBe(30_000);
  });

  it("ignores a non-positive block", () => {
    const clock = fakeClock();
    const bucket = clock.bucket(1000);

    bucket.blockFor(0);
    bucket.blockFor(-5);
    expect(bucket.tryAcquire()).toBe(true);
  });
});

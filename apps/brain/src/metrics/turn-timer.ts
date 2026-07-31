export interface SpanTiming {
  readonly name: string;
  readonly startedAt: number;
  readonly durationMs: number;
}

export interface TurnMetrics {
  readonly correlationId: string;
  readonly providerId: string;
  readonly language: string;
  readonly toolRounds: number;
  readonly toolCount: number;
  readonly totalMs: number;
  readonly spans: readonly SpanTiming[];
  readonly memoryHits: number;
  readonly replyChars: number;
}

/**
 * Lightweight latency tracker for a single conversation turn.
 * Avoids allocations until the turn completes.
 */
export class TurnTimer {
  private readonly startedAt = performance.now();
  private readonly spans: SpanTiming[] = [];
  private open = new Map<string, number>();

  start(name: string): void {
    this.open.set(name, performance.now());
  }

  end(name: string): number {
    const start = this.open.get(name);
    const now = performance.now();
    const durationMs = start === undefined ? 0 : now - start;
    this.open.delete(name);
    this.spans.push({ name, startedAt: start ?? now, durationMs });
    return durationMs;
  }

  finish(meta: {
    correlationId: string;
    providerId: string;
    language: string;
    toolRounds: number;
    toolCount: number;
    memoryHits: number;
    replyChars: number;
  }): TurnMetrics {
    return {
      ...meta,
      totalMs: performance.now() - this.startedAt,
      spans: [...this.spans],
    };
  }
}

export class MetricsCollector {
  private readonly turns: TurnMetrics[] = [];

  record(turn: TurnMetrics): void {
    this.turns.push(turn);
  }

  all(): readonly TurnMetrics[] {
    return this.turns;
  }

  summary(): {
    readonly turns: number;
    readonly avgTotalMs: number;
    readonly p95TotalMs: number;
    readonly avgLlmMs: number;
    readonly avgToolMs: number;
    readonly avgMemoryMs: number;
  } {
    const totals = this.turns.map((t) => t.totalMs).sort((a, b) => a - b);
    const avg = (xs: number[]) =>
      xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
    const p95 =
      totals.length === 0
        ? 0
        : totals[Math.min(totals.length - 1, Math.floor(totals.length * 0.95))]!;

    const spanAvg = (name: string) =>
      avg(
        this.turns.flatMap((t) =>
          t.spans.filter((s) => s.name === name).map((s) => s.durationMs),
        ),
      );

    return {
      turns: this.turns.length,
      avgTotalMs: avg(totals),
      p95TotalMs: p95,
      avgLlmMs: spanAvg("llm"),
      avgToolMs: spanAvg("tool"),
      avgMemoryMs: spanAvg("memory"),
    };
  }
}

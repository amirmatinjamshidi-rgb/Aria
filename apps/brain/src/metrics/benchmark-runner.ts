import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
} from "@aria/contracts";
import { createBrainContainer, resolveBrainPorts } from "../composition-root.js";
import type { TurnMetrics } from "../metrics/turn-timer.js";

export interface BenchmarkReport {
  readonly generatedAt: string;
  readonly providerId: string;
  readonly turns: readonly TurnMetrics[];
  readonly summary: {
    readonly turns: number;
    readonly avgTotalMs: number;
    readonly p95TotalMs: number;
    readonly avgLlmMs: number;
    readonly avgToolMs: number;
    readonly avgMemoryMs: number;
  };
  readonly process: {
    readonly rssBytes: number;
    readonly heapUsedBytes: number;
  };
}

const DEFAULT_UTTERANCES = [
  { text: "Hello Aria, who are you?", language: "en" as const },
  { text: "What time is it?", language: "en" as const },
  { text: "Turn on the living room light", language: "en" as const },
  { text: "سلام آریا", language: "fa" as const },
  { text: "یادت باشه که چای دوست دارم", language: "fa" as const },
];

/**
 * Runs a fixed utterance set and collects turn-level latency metrics.
 * GPU utilization requires external tooling (nvidia-smi); we record process memory.
 */
export async function runPhase1Benchmark(
  env: NodeJS.ProcessEnv = {
    ARIA_LLM_PROVIDER: "mock",
    ARIA_LOG_LEVEL: "error",
  },
): Promise<BenchmarkReport> {
  const { container, conversation } = await createBrainContainer(env);
  const { bus, llm } = resolveBrainPorts(container);
  const stop = conversation.start();

  for (const [index, demo] of DEFAULT_UTTERANCES.entries()) {
    const replyPromise = new Promise<void>((resolve) => {
      const unsub = bus.subscribe(
        AriaEventType.ConversationAssistantReply,
        () => {
          unsub();
          resolve();
        },
      );
    });
    await bus.publish(
      createUserUtterance(demo.text, demo.language, `bench-${index + 1}`),
    );
    await replyPromise;
  }

  // Drain — ensure typed as AssistantReplyEvent path used
  void 0 as unknown as AssistantReplyEvent;

  const summary = conversation.getMetrics().summary();
  const mem = process.memoryUsage();

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    providerId: llm.metadata.id,
    turns: conversation.getMetrics().all(),
    summary,
    process: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
    },
  };

  stop();
  await bus.dispose?.();
  return report;
}

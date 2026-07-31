import { describe, expect, it } from "vitest";
import { runPhase1Evaluation } from "../src/evaluation/evaluation-runner.js";
import { runPhase1Benchmark } from "../src/metrics/benchmark-runner.js";

describe("Phase 1 evaluation framework", () => {
  it("scores mock conversations across dimensions", async () => {
    const report = await runPhase1Evaluation({
      ARIA_LLM_PROVIDER: "mock",
      ARIA_LOG_LEVEL: "error",
    });

    expect(report.summary.total).toBeGreaterThanOrEqual(10);
    expect(report.summary.averageScore).toBeGreaterThan(0.7);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.byDimension["tool_synthesis"]).toBeDefined();
  });
});

describe("Phase 1 latency benchmark", () => {
  it("produces a summary report for mock provider", async () => {
    const report = await runPhase1Benchmark({
      ARIA_LLM_PROVIDER: "mock",
      ARIA_LOG_LEVEL: "error",
    });

    expect(report.providerId).toBe("mock");
    expect(report.summary.turns).toBeGreaterThanOrEqual(5);
    expect(report.summary.avgTotalMs).toBeGreaterThanOrEqual(0);
    expect(report.process.heapUsedBytes).toBeGreaterThan(0);
  });
});

import type { IToolMetrics, ToolMetricSample } from "@aria/contracts";

export class ToolMetricsCollector implements IToolMetrics {
  private total = 0;
  private success = 0;
  private failure = 0;
  private timeouts = 0;
  private readonly byTool = new Map<
    string,
    { success: number; failure: number; totalLatencyMs: number }
  >();

  record(sample: ToolMetricSample): void {
    this.total += 1;
    if (sample.ok) {
      this.success += 1;
    } else {
      this.failure += 1;
      if (sample.errorCode === "TIMEOUT") {
        this.timeouts += 1;
      }
    }
    let entry = this.byTool.get(sample.toolName);
    if (!entry) {
      entry = { success: 0, failure: 0, totalLatencyMs: 0 };
      this.byTool.set(sample.toolName, entry);
    }
    if (sample.ok) {
      entry.success += 1;
    } else {
      entry.failure += 1;
    }
    entry.totalLatencyMs += sample.latencyMs;
  }

  snapshot() {
    return {
      total: this.total,
      success: this.success,
      failure: this.failure,
      timeouts: this.timeouts,
      byTool: new Map(this.byTool),
    };
  }
}

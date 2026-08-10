import type {
  IDecisionTraceWriter,
  PlannerDecisionTrace,
} from "@aria/contracts";

export class InMemoryDecisionTraceWriter implements IDecisionTraceWriter {
  readonly traces: PlannerDecisionTrace[] = [];

  write(trace: PlannerDecisionTrace): void {
    this.traces.push(trace);
  }
}

export class LoggingDecisionTraceWriter implements IDecisionTraceWriter {
  constructor(
    private readonly log: (message: string, meta?: Record<string, unknown>) => void,
  ) {}

  write(trace: PlannerDecisionTrace): void {
    this.log("planner decision", {
      correlationId: trace.correlationId,
      catalogVersion: trace.catalogVersion,
      accepted: trace.accepted,
      rejected: trace.rejected,
    });
  }
}

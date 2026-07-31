export type EvalDimension =
  | "conversation"
  | "personality"
  | "memory"
  | "planning"
  | "tool_calling"
  | "tool_synthesis"
  | "safety"
  | "language"
  | "latency"
  | "reasoning";

export interface EvalCase {
  readonly id: string;
  readonly dimension: EvalDimension;
  readonly language: "en" | "fa";
  readonly user: string;
  readonly expectTool?: string | null;
  readonly expectNoTool?: boolean;
  readonly expectReplyIncludes?: readonly string[];
  readonly expectReplyExcludes?: readonly string[];
  readonly expectLanguage?: "en" | "fa";
  readonly maxLatencyMs?: number;
  readonly unsafe?: boolean;
}

export interface EvalScore {
  readonly dimension: EvalDimension;
  readonly caseId: string;
  readonly passed: boolean;
  readonly score: number;
  readonly details: string;
  readonly latencyMs?: number;
}

export interface EvalReport {
  readonly generatedAt: string;
  readonly providerId: string;
  readonly scores: readonly EvalScore[];
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly averageScore: number;
    readonly byDimension: Readonly<Record<string, { passed: number; total: number; avg: number }>>;
  };
}

import { z } from "zod";
import {
  ToolErrorSchema,
  type ToolError,
} from "./schemas/tools.js";

export type { ToolError };
export * from "./schemas/tools.js";
export * from "./schemas/search.js";
export * from "./schemas/providers.js";

/** ISO language tags Aria supports in Phase 0+ */
export const LanguageCodeSchema = z.enum(["en", "fa"]);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

export const VoicePipelineStateSchema = z.enum([
  "idle",
  "listening",
  "transcribing",
  "thinking",
  "speaking",
  "stopping",
  "error",
]);
export type VoicePipelineState = z.infer<typeof VoicePipelineStateSchema>;

export const AudioFormatSchema = z.object({
  sampleRateHz: z.number().int().positive(),
  channels: z.literal(1),
  sampleFormat: z.literal("s16le"),
});
export type AudioFormat = z.infer<typeof AudioFormatSchema>;

export const TranscriptionSchema = z.object({
  text: z.string(),
  language: LanguageCodeSchema,
  languageProbability: z.number().min(0).max(1).optional(),
  durationMs: z.number().nonnegative(),
  inferenceMs: z.number().nonnegative(),
});
export type Transcription = z.infer<typeof TranscriptionSchema>;

export const VoiceTurnMetricsSchema = z.object({
  correlationId: z.string(),
  speechDurationMs: z.number().nonnegative(),
  vadMs: z.number().nonnegative(),
  sttMs: z.number().nonnegative(),
  agentMs: z.number().nonnegative(),
  ttsMs: z.number().nonnegative(),
  playbackStartMs: z.number().nonnegative(),
  totalMs: z.number().nonnegative(),
  interrupted: z.boolean(),
  timestamp: z.string().datetime(),
});
export type VoiceTurnMetrics = z.infer<typeof VoiceTurnMetricsSchema>;

export const AriaEnvironmentSchema = z.enum(["dev", "sim", "robot"]);
export type AriaEnvironment = z.infer<typeof AriaEnvironmentSchema>;

export const LogLevelSchema = z.enum([
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const ChatRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool",
]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string(),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/** JSON-Schema-ish parameters object passed to LLM providers for tool calling */
export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.record(z.unknown()).default({
    type: "object",
    properties: {},
  }),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  name: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  /** Structured tool error; string retained for backward-compatible parsers. */
  error: z.union([ToolErrorSchema, z.string()]).optional(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

/** One hit from a web search provider */
export const WebSearchHitSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string().default(""),
});
export type WebSearchHit = z.infer<typeof WebSearchHitSchema>;

export const WebSearchResponseSchema = z.object({
  query: z.string(),
  hits: z.array(WebSearchHitSchema),
  provider: z.string(),
});
export type WebSearchResponse = z.infer<typeof WebSearchResponseSchema>;

/** Cleaned page content from a URL fetch */
export const WebPageContentSchema = z.object({
  url: z.string().url(),
  title: z.string().default(""),
  text: z.string(),
  truncated: z.boolean().default(false),
});
export type WebPageContent = z.infer<typeof WebPageContentSchema>;

export const LlmCompletionSchema = z.object({
  content: z.string(),
  toolCalls: z.array(ToolCallSchema).default([]),
  language: LanguageCodeSchema.optional(),
  finishReason: z.enum(["stop", "tool_calls", "length", "error"]).optional(),
});
export type LlmCompletion = z.infer<typeof LlmCompletionSchema>;

export const GoalSchema = z.object({
  id: z.string(),
  description: z.string(),
  priority: z.number().int().min(0).max(100).default(50),
  parameters: z.record(z.unknown()).default({}),
  requestedBy: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Goal = z.infer<typeof GoalSchema>;

export const SkillStatusSchema = z.enum([
  "idle",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type SkillStatus = z.infer<typeof SkillStatusSchema>;

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const DetectedObjectSchema = z.object({
  id: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: BoundingBoxSchema,
  trackId: z.string().nullish(),
  /** Optional sidecar mask / segment reference (on-demand SAM2). */
  maskRef: z.string().nullish(),
});
export type DetectedObject = z.infer<typeof DetectedObjectSchema>;

export const MemoryKindSchema = z.enum([
  "episodic",
  "semantic",
  "preference",
  "routine",
  "conversation",
]);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const MemoryRecordSchema = z.object({
  id: z.string(),
  kind: MemoryKindSchema,
  content: z.string(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  score: z.number().optional(),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

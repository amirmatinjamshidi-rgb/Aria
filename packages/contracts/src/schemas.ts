import { z } from "zod";

/** ISO language tags Aria supports in Phase 0+ */
export const LanguageCodeSchema = z.enum(["en", "fa"]);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

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
  trackId: z.string().optional(),
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

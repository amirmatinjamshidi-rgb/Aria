import { z } from "zod";
import type { LanguageCode, ToolCall, ToolResult } from "./schemas.js";
import {
  ChatMessageSchema,
  DetectedObjectSchema,
  GoalSchema,
  LanguageCodeSchema,
  LlmCompletionSchema,
  MemoryRecordSchema,
  SkillStatusSchema,
  ToolCallSchema,
  ToolResultSchema,
  TranscriptionSchema,
  VoicePipelineStateSchema,
  VoiceTurnMetricsSchema,
} from "./schemas.js";

/**
 * Canonical event catalog.
 * Every inter-service message must be registered here with a Zod schema.
 */
export const AriaEventType = {
  ConversationUserUtterance: "conversation.user_utterance",
  ConversationAssistantReply: "conversation.assistant_reply",
  ConversationAssistantDelta: "conversation.assistant_delta",
  ConversationLlmCompletion: "conversation.llm_completion",
  ConversationToolCallRequested: "conversation.tool_call_requested",
  ConversationToolCallCompleted: "conversation.tool_call_completed",
  VoiceStateChanged: "voice.state_changed",
  VoiceSpeechStarted: "voice.speech_started",
  VoiceTranscriptionCompleted: "voice.transcription_completed",
  VoiceTurnMetrics: "voice.turn_metrics",
  VoiceInterrupted: "voice.interrupted",
  GoalCreated: "goal.created",
  GoalCompleted: "goal.completed",
  GoalFailed: "goal.failed",
  SkillStatusChanged: "skill.status_changed",
  VisionSceneUpdated: "vision.scene_updated",
  MemoryStored: "memory.stored",
  MemoryRetrieved: "memory.retrieved",
  SystemHealth: "system.health",
  SystemSafeStop: "system.safe_stop",
} as const;

export type AriaEventTypeName =
  (typeof AriaEventType)[keyof typeof AriaEventType];

export const UserUtteranceEventSchema = z.object({
  type: z.literal(AriaEventType.ConversationUserUtterance),
  correlationId: z.string(),
  text: z.string(),
  language: LanguageCodeSchema,
  timestamp: z.string().datetime(),
});
export type UserUtteranceEvent = z.infer<typeof UserUtteranceEventSchema>;

export const AssistantReplyEventSchema = z.object({
  type: z.literal(AriaEventType.ConversationAssistantReply),
  correlationId: z.string(),
  text: z.string(),
  language: LanguageCodeSchema,
  timestamp: z.string().datetime(),
});
export type AssistantReplyEvent = z.infer<typeof AssistantReplyEventSchema>;

/**
 * Incremental assistant text while the LLM is still generating.
 * Consumers buffer `delta` in `sequence` order; `done` marks the last event of
 * the turn (and carries no text). A turn that emits no deltas is still valid —
 * consumers must fall back to `conversation.assistant_reply`.
 */
export const AssistantDeltaEventSchema = z.object({
  type: z.literal(AriaEventType.ConversationAssistantDelta),
  correlationId: z.string(),
  delta: z.string(),
  sequence: z.number().int().nonnegative(),
  done: z.boolean(),
  language: LanguageCodeSchema,
  timestamp: z.string().datetime(),
});
export type AssistantDeltaEvent = z.infer<typeof AssistantDeltaEventSchema>;

export const LlmCompletionEventSchema = z.object({
  type: z.literal(AriaEventType.ConversationLlmCompletion),
  correlationId: z.string(),
  messages: z.array(ChatMessageSchema),
  completion: LlmCompletionSchema,
  timestamp: z.string().datetime(),
});
export type LlmCompletionEvent = z.infer<typeof LlmCompletionEventSchema>;

export const ToolCallRequestedEventSchema = z.object({
  type: z.literal(AriaEventType.ConversationToolCallRequested),
  correlationId: z.string(),
  toolCall: ToolCallSchema,
  timestamp: z.string().datetime(),
});
export type ToolCallRequestedEvent = z.infer<
  typeof ToolCallRequestedEventSchema
>;

export const ToolCallCompletedEventSchema = z.object({
  type: z.literal(AriaEventType.ConversationToolCallCompleted),
  correlationId: z.string(),
  result: ToolResultSchema,
  timestamp: z.string().datetime(),
});
export type ToolCallCompletedEvent = z.infer<
  typeof ToolCallCompletedEventSchema
>;

export const VoiceStateChangedEventSchema = z.object({
  type: z.literal(AriaEventType.VoiceStateChanged),
  correlationId: z.string().optional(),
  previous: VoicePipelineStateSchema,
  current: VoicePipelineStateSchema,
  timestamp: z.string().datetime(),
});
export type VoiceStateChangedEvent = z.infer<
  typeof VoiceStateChangedEventSchema
>;

export const VoiceSpeechStartedEventSchema = z.object({
  type: z.literal(AriaEventType.VoiceSpeechStarted),
  correlationId: z.string(),
  timestamp: z.string().datetime(),
});
export type VoiceSpeechStartedEvent = z.infer<
  typeof VoiceSpeechStartedEventSchema
>;

export const VoiceTranscriptionCompletedEventSchema = z.object({
  type: z.literal(AriaEventType.VoiceTranscriptionCompleted),
  correlationId: z.string(),
  transcription: TranscriptionSchema,
  timestamp: z.string().datetime(),
});
export type VoiceTranscriptionCompletedEvent = z.infer<
  typeof VoiceTranscriptionCompletedEventSchema
>;

export const VoiceTurnMetricsEventSchema = z.object({
  type: z.literal(AriaEventType.VoiceTurnMetrics),
  correlationId: z.string(),
  metrics: VoiceTurnMetricsSchema,
  timestamp: z.string().datetime(),
});
export type VoiceTurnMetricsEvent = z.infer<
  typeof VoiceTurnMetricsEventSchema
>;

export const VoiceInterruptedEventSchema = z.object({
  type: z.literal(AriaEventType.VoiceInterrupted),
  correlationId: z.string().optional(),
  reason: z.enum(["barge_in", "stop", "shutdown"]),
  timestamp: z.string().datetime(),
});
export type VoiceInterruptedEvent = z.infer<
  typeof VoiceInterruptedEventSchema
>;

export const GoalCreatedEventSchema = z.object({
  type: z.literal(AriaEventType.GoalCreated),
  correlationId: z.string(),
  goal: GoalSchema,
  timestamp: z.string().datetime(),
});
export type GoalCreatedEvent = z.infer<typeof GoalCreatedEventSchema>;

export const GoalCompletedEventSchema = z.object({
  type: z.literal(AriaEventType.GoalCompleted),
  correlationId: z.string(),
  goalId: z.string(),
  result: z.record(z.unknown()).default({}),
  timestamp: z.string().datetime(),
});
export type GoalCompletedEvent = z.infer<typeof GoalCompletedEventSchema>;

export const GoalFailedEventSchema = z.object({
  type: z.literal(AriaEventType.GoalFailed),
  correlationId: z.string(),
  goalId: z.string(),
  reason: z.string(),
  timestamp: z.string().datetime(),
});
export type GoalFailedEvent = z.infer<typeof GoalFailedEventSchema>;

export const SkillStatusChangedEventSchema = z.object({
  type: z.literal(AriaEventType.SkillStatusChanged),
  correlationId: z.string(),
  skillId: z.string(),
  status: SkillStatusSchema,
  detail: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type SkillStatusChangedEvent = z.infer<
  typeof SkillStatusChangedEventSchema
>;

export const VisionSceneUpdatedEventSchema = z.object({
  type: z.literal(AriaEventType.VisionSceneUpdated),
  correlationId: z.string(),
  objects: z.array(DetectedObjectSchema),
  description: z.string().optional(),
  frameId: z.string().optional(),
  /** mock = synthetic fixtures; live = real camera/models */
  source: z.enum(["mock", "live"]).optional(),
  timestamp: z.string().datetime(),
});
export type VisionSceneUpdatedEvent = z.infer<
  typeof VisionSceneUpdatedEventSchema
>;

export const MemoryStoredEventSchema = z.object({
  type: z.literal(AriaEventType.MemoryStored),
  correlationId: z.string(),
  record: MemoryRecordSchema,
  timestamp: z.string().datetime(),
});
export type MemoryStoredEvent = z.infer<typeof MemoryStoredEventSchema>;

export const MemoryRetrievedEventSchema = z.object({
  type: z.literal(AriaEventType.MemoryRetrieved),
  correlationId: z.string(),
  query: z.string(),
  records: z.array(MemoryRecordSchema),
  timestamp: z.string().datetime(),
});
export type MemoryRetrievedEvent = z.infer<typeof MemoryRetrievedEventSchema>;

export const SystemHealthEventSchema = z.object({
  type: z.literal(AriaEventType.SystemHealth),
  service: z.string(),
  healthy: z.boolean(),
  detail: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type SystemHealthEvent = z.infer<typeof SystemHealthEventSchema>;

export const SystemSafeStopEventSchema = z.object({
  type: z.literal(AriaEventType.SystemSafeStop),
  reason: z.string(),
  source: z.string(),
  timestamp: z.string().datetime(),
});
export type SystemSafeStopEvent = z.infer<typeof SystemSafeStopEventSchema>;

export const AriaEventSchema = z.discriminatedUnion("type", [
  UserUtteranceEventSchema,
  AssistantReplyEventSchema,
  AssistantDeltaEventSchema,
  LlmCompletionEventSchema,
  ToolCallRequestedEventSchema,
  ToolCallCompletedEventSchema,
  VoiceStateChangedEventSchema,
  VoiceSpeechStartedEventSchema,
  VoiceTranscriptionCompletedEventSchema,
  VoiceTurnMetricsEventSchema,
  VoiceInterruptedEventSchema,
  GoalCreatedEventSchema,
  GoalCompletedEventSchema,
  GoalFailedEventSchema,
  SkillStatusChangedEventSchema,
  VisionSceneUpdatedEventSchema,
  MemoryStoredEventSchema,
  MemoryRetrievedEventSchema,
  SystemHealthEventSchema,
  SystemSafeStopEventSchema,
]);
export type AriaEvent = z.infer<typeof AriaEventSchema>;

export type EventHandler<T extends AriaEvent = AriaEvent> = (
  event: T,
) => void | Promise<void>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createUserUtterance(
  text: string,
  language: LanguageCode,
  correlationId: string,
): UserUtteranceEvent {
  return {
    type: AriaEventType.ConversationUserUtterance,
    correlationId,
    text,
    language,
    timestamp: nowIso(),
  };
}

export function createAssistantReply(
  text: string,
  language: LanguageCode,
  correlationId: string,
): AssistantReplyEvent {
  return {
    type: AriaEventType.ConversationAssistantReply,
    correlationId,
    text,
    language,
    timestamp: nowIso(),
  };
}

export function createAssistantDelta(
  delta: string,
  language: LanguageCode,
  correlationId: string,
  sequence: number,
  done = false,
): AssistantDeltaEvent {
  return {
    type: AriaEventType.ConversationAssistantDelta,
    correlationId,
    delta,
    sequence,
    done,
    language,
    timestamp: nowIso(),
  };
}

export function createToolCallRequested(
  toolCall: ToolCall,
  correlationId: string,
): ToolCallRequestedEvent {
  return {
    type: AriaEventType.ConversationToolCallRequested,
    correlationId,
    toolCall,
    timestamp: nowIso(),
  };
}

export function createToolCallCompleted(
  result: ToolResult,
  correlationId: string,
): ToolCallCompletedEvent {
  return {
    type: AriaEventType.ConversationToolCallCompleted,
    correlationId,
    result,
    timestamp: nowIso(),
  };
}

export function createVisionSceneUpdated(
  objects: VisionSceneUpdatedEvent["objects"],
  correlationId: string,
  options: {
    readonly description?: string;
    readonly frameId?: string;
    readonly source?: "mock" | "live";
  } = {},
): VisionSceneUpdatedEvent {
  return {
    type: AriaEventType.VisionSceneUpdated,
    correlationId,
    objects,
    description: options.description,
    frameId: options.frameId,
    source: options.source,
    timestamp: nowIso(),
  };
}

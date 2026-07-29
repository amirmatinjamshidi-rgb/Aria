import { z } from "zod";
import type { LanguageCode } from "./schemas.js";
import {
  ChatMessageSchema,
  DetectedObjectSchema,
  GoalSchema,
  LanguageCodeSchema,
  LlmCompletionSchema,
  MemoryRecordSchema,
  SkillStatusSchema,
} from "./schemas.js";

/**
 * Canonical event catalog.
 * Every inter-service message must be registered here with a Zod schema.
 */
export const AriaEventType = {
  ConversationUserUtterance: "conversation.user_utterance",
  ConversationAssistantReply: "conversation.assistant_reply",
  ConversationLlmCompletion: "conversation.llm_completion",
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

export const LlmCompletionEventSchema = z.object({
  type: z.literal(AriaEventType.ConversationLlmCompletion),
  correlationId: z.string(),
  messages: z.array(ChatMessageSchema),
  completion: LlmCompletionSchema,
  timestamp: z.string().datetime(),
});
export type LlmCompletionEvent = z.infer<typeof LlmCompletionEventSchema>;

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
  LlmCompletionEventSchema,
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

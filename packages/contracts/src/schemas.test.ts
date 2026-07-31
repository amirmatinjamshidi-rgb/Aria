import { describe, expect, it } from "vitest";
import {
  AriaEventType,
  ChatMessageSchema,
  ToolCallSchema,
  ToolDefinitionSchema,
  ToolResultSchema,
  createAssistantReply,
  createToolCallCompleted,
  createToolCallRequested,
  createUserUtterance,
  GoalSchema,
} from "../src/index.js";

describe("@aria/contracts", () => {
  it("parses a chat message", () => {
    const msg = ChatMessageSchema.parse({
      role: "user",
      content: "سلام",
    });
    expect(msg.role).toBe("user");
  });

  it("builds bilingual conversation events", () => {
    const user = createUserUtterance("hello", "en", "c1");
    const reply = createAssistantReply("hi there", "en", "c1");
    expect(user.type).toBe(AriaEventType.ConversationUserUtterance);
    expect(reply.type).toBe(AriaEventType.ConversationAssistantReply);
  });

  it("validates a goal schema", () => {
    const goal = GoalSchema.parse({
      id: "g1",
      description: "Make tea",
      createdAt: new Date().toISOString(),
    });
    expect(goal.priority).toBe(50);
  });

  it("validates tool definitions, calls, and results", () => {
    const def = ToolDefinitionSchema.parse({
      name: "get_current_time",
      description: "Returns the current local time",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string" },
        },
      },
    });
    expect(def.name).toBe("get_current_time");

    const call = ToolCallSchema.parse({
      id: "tc1",
      name: "get_current_time",
      arguments: { timezone: "UTC" },
    });
    const result = ToolResultSchema.parse({
      toolCallId: call.id,
      name: call.name,
      ok: true,
      result: { iso: "2026-07-29T00:00:00.000Z" },
    });

    const requested = createToolCallRequested(call, "c1");
    const completed = createToolCallCompleted(result, "c1");
    expect(requested.type).toBe(AriaEventType.ConversationToolCallRequested);
    expect(completed.type).toBe(AriaEventType.ConversationToolCallCompleted);
  });
});

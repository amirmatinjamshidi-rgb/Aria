import { describe, expect, it } from "vitest";
import {
  AriaEventType,
  ChatMessageSchema,
  createAssistantReply,
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
});

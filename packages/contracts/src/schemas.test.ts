import { describe, expect, it } from "vitest";
import {
  AriaEventType,
  ChatMessageSchema,
  ToolCallSchema,
  ToolDefinitionSchema,
  ToolResultSchema,
  VoicePipelineStateSchema,
  VoiceTurnMetricsSchema,
  WebPageContentSchema,
  WebSearchResponseSchema,
  createAssistantReply,
  createToolCallCompleted,
  createToolCallRequested,
  createUserUtterance,
  createVisionSceneUpdated,
  GoalSchema,
  VisionSceneUpdatedEventSchema,
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

  it("validates voice lifecycle state and latency metrics", () => {
    expect(VoicePipelineStateSchema.parse("speaking")).toBe("speaking");
    const metrics = VoiceTurnMetricsSchema.parse({
      correlationId: "voice-1",
      speechDurationMs: 800,
      vadMs: 12,
      sttMs: 320,
      agentMs: 600,
      ttsMs: 180,
      playbackStartMs: 1100,
      totalMs: 1900,
      interrupted: false,
      timestamp: new Date().toISOString(),
    });
    expect(metrics.playbackStartMs).toBeLessThan(2000);
  });

  it("parses web search and page schemas", () => {
    const search = WebSearchResponseSchema.parse({
      query: "aria",
      provider: "mock",
      hits: [
        {
          title: "Aria",
          url: "https://example.com",
          snippet: "home assistant",
        },
      ],
    });
    expect(search.hits).toHaveLength(1);

    const page = WebPageContentSchema.parse({
      url: "https://example.com/page",
      title: "Page",
      text: "Hello",
      truncated: false,
    });
    expect(page.text).toBe("Hello");
  });

  it("validates vision.scene_updated events", () => {
    const event = createVisionSceneUpdated(
      [
        {
          id: "det-1",
          label: "person",
          confidence: 0.9,
          bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.5 },
          trackId: "track-1",
        },
      ],
      "vision-1",
      { frameId: "f1", description: "a person" },
    );
    const parsed = VisionSceneUpdatedEventSchema.parse(event);
    expect(parsed.type).toBe(AriaEventType.VisionSceneUpdated);
    expect(parsed.objects[0]?.trackId).toBe("track-1");
  });
});

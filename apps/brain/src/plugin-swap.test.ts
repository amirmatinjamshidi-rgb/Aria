import { describe, expect, it, vi } from "vitest";
import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
  type ToolCallCompletedEvent,
  type ToolCallRequestedEvent,
} from "@aria/contracts";
import { createBrainContainer, resolveBrainPorts } from "../src/composition-root.js";
import { PersonalityEngine } from "../src/personality/personality-engine.js";
import { OllamaLlmProvider } from "../src/plugins/ollama-llm.js";
import { createDefaultToolRegistry } from "../src/tools/create-default-tools.js";

async function runUtterance(
  env: NodeJS.ProcessEnv,
  text: string,
  language: "en" | "fa",
): Promise<{
  reply: string;
  providerId: string;
  toolRequested: ToolCallRequestedEvent[];
  toolCompleted: ToolCallCompletedEvent[];
}> {
  const { container, conversation } = await createBrainContainer(env);
  const { bus, llm } = resolveBrainPorts(container);
  const stop = conversation.start();

  const toolRequested: ToolCallRequestedEvent[] = [];
  const toolCompleted: ToolCallCompletedEvent[] = [];

  bus.subscribe(AriaEventType.ConversationToolCallRequested, (event) => {
    toolRequested.push(event as ToolCallRequestedEvent);
  });
  bus.subscribe(AriaEventType.ConversationToolCallCompleted, (event) => {
    toolCompleted.push(event as ToolCallCompletedEvent);
  });

  const replyPromise = new Promise<string>((resolve) => {
    bus.subscribe(AriaEventType.ConversationAssistantReply, (event) => {
      resolve((event as AssistantReplyEvent).text);
    });
  });

  await bus.publish(createUserUtterance(text, language, "test-1"));
  const reply = await replyPromise;

  stop();
  await bus.dispose?.();

  return {
    reply,
    providerId: llm.metadata.id,
    toolRequested,
    toolCompleted,
  };
}

describe("LLM provider hot-swap", () => {
  it("uses mock provider when configured", async () => {
    const { reply, providerId } = await runUtterance(
      { ARIA_LLM_PROVIDER: "mock", ARIA_LOG_LEVEL: "error" },
      "hello",
      "en",
    );
    expect(providerId).toBe("mock");
    expect(reply).toContain("mock");
    expect(reply).toContain("hello");
  });

  it("uses echo provider when configured — zero brain code changes", async () => {
    const { reply, providerId } = await runUtterance(
      { ARIA_LLM_PROVIDER: "echo", ARIA_LOG_LEVEL: "error" },
      "hello",
      "en",
    );
    expect(providerId).toBe("echo");
    expect(reply).toBe("Echo: hello");
  });

  it("handles Persian with the echo provider", async () => {
    const { reply, providerId } = await runUtterance(
      { ARIA_LLM_PROVIDER: "echo", ARIA_LOG_LEVEL: "error" },
      "سلام",
      "fa",
    );
    expect(providerId).toBe("echo");
    expect(reply).toBe("پژواک: سلام");
  });
});

describe("Phase 1 tool calling", () => {
  it("emits validated tool events for get_current_time", async () => {
    const result = await runUtterance(
      { ARIA_LLM_PROVIDER: "mock", ARIA_LOG_LEVEL: "error" },
      "What time is it?",
      "en",
    );

    expect(result.toolRequested).toHaveLength(1);
    expect(result.toolRequested[0]?.toolCall.name).toBe("get_current_time");
    expect(result.toolCompleted).toHaveLength(1);
    expect(result.toolCompleted[0]?.result.ok).toBe(true);
    expect(result.reply).toMatch(/Tool result|Done/i);
  });

  it("turns on a simulated light via set_light", async () => {
    const result = await runUtterance(
      { ARIA_LLM_PROVIDER: "mock", ARIA_LOG_LEVEL: "error" },
      "Please turn on the living room light",
      "en",
    );

    expect(result.toolCompleted[0]?.result.name).toBe("set_light");
    expect(result.toolCompleted[0]?.result.ok).toBe(true);
    expect(result.toolCompleted[0]?.result.result).toMatchObject({
      room: "living_room",
      on: true,
    });
  });

  it("notes a Persian preference via note_preference", async () => {
    const result = await runUtterance(
      { ARIA_LLM_PROVIDER: "mock", ARIA_LOG_LEVEL: "error" },
      "یادت باشه که چای دوست دارم",
      "fa",
    );

    expect(result.toolCompleted[0]?.result.name).toBe("note_preference");
    expect(result.toolCompleted[0]?.result.ok).toBe(true);
    expect(result.reply).toMatch(/انجام شد|نتیجه/);
  });
});

describe("PersonalityEngine", () => {
  it("builds a bilingual system prompt from profile fields", () => {
    const engine = new PersonalityEngine({
      name: "Aria",
      tone: "warm",
      traits: ["helpful", "bilingual"],
    });
    const prompt = engine.buildSystemPrompt("fa");
    expect(prompt).toContain("Aria");
    expect(prompt).toContain("Persian");
    expect(prompt).toContain("helpful");
  });

  it("honors an explicit system prompt override", () => {
    const engine = new PersonalityEngine({
      name: "Aria",
      tone: "warm",
      traits: ["helpful"],
      systemPrompt: "OVERRIDE_PROMPT",
    });
    expect(engine.buildSystemPrompt("en")).toBe("OVERRIDE_PROMPT");
  });
});

describe("ToolRegistry", () => {
  it("lists default Phase 1 tools", () => {
    const registry = createDefaultToolRegistry();
    const names = registry.listDefinitions().map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_current_time",
        "note_preference",
        "set_light",
      ]),
    );
  });

  it("returns ok:false for unknown tools", async () => {
    const registry = createDefaultToolRegistry();
    const result = await registry.execute(
      { id: "x", name: "missing_tool", arguments: {} },
      { correlationId: "c1" },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unknown tool/);
  });
});

describe("OllamaLlmProvider", () => {
  it("maps chat + tools to the Ollama API and parses tool calls", async () => {
    const fetchImpl = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(
          JSON.stringify({
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "tc1",
                  function: {
                    name: "get_current_time",
                    arguments: { timezone: "UTC" },
                  },
                },
              ],
            },
            done_reason: "stop",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const provider = new OllamaLlmProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3.5:latest",
      fetchImpl,
    });

    const completion = await provider.generate(
      [{ role: "user", content: "time?" }],
      {
        tools: [
          {
            name: "get_current_time",
            description: "time",
            parameters: { type: "object", properties: {} },
          },
        ],
      },
    );

    expect(completion.finishReason).toBe("tool_calls");
    expect(completion.toolCalls[0]?.name).toBe("get_current_time");
    expect(fetchImpl).toHaveBeenCalledOnce();

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(init).toEqual(expect.objectContaining({ method: "POST" }));

    const body = JSON.parse(String(init?.body)) as {
      model: string;
      tools: unknown[];
    };
    expect(body.model).toBe("qwen3.5:latest");
    expect(body.tools).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
  type ToolCallCompletedEvent,
  type ToolCallRequestedEvent,
} from "@aria/contracts";
import { createBrainContainer, resolveBrainPorts } from "./composition-root.js";
import { PersonalityService } from "./personality/personality-service.js";
import { ConversationPlanner } from "./planning/conversation-planner.js";
import { OllamaLlmProvider } from "./plugins/ollama-llm.js";
import { OpenRouterLlmProvider } from "./plugins/openrouter-llm.js";
import { SessionMemoryStore } from "./memory/session-memory-store.js";
import { createDefaultToolRegistry } from "./tools/create-default-tools.js";
import { ToolResultSynthesizer } from "./tools/tool-result-synthesizer.js";
import { vi } from "vitest";

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
      "Hello Aria, who are you?",
      "en",
    );
    expect(providerId).toBe("mock");
    expect(reply).toContain("Aria");
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

  it("rejects openrouter without an API key", async () => {
    await expect(
      createBrainContainer({
        ARIA_LLM_PROVIDER: "openrouter",
        ARIA_LOG_LEVEL: "error",
      }),
    ).rejects.toThrow(/ARIA_OPENROUTER_API_KEY/);
  });
});

describe("Phase 1 tool calling + synthesis", () => {
  it("emits validated tool events and natural time reply", async () => {
    const result = await runUtterance(
      { ARIA_LLM_PROVIDER: "mock", ARIA_LOG_LEVEL: "error" },
      "What time is it?",
      "en",
    );

    expect(result.toolRequested).toHaveLength(1);
    expect(result.toolRequested[0]?.toolCall.name).toBe("get_current_time");
    expect(result.toolCompleted[0]?.result.ok).toBe(true);
    expect(result.reply).toMatch(/currently/i);
    expect(result.reply).not.toMatch(/\{"iso"/);
  });

  it("turns on a simulated light with natural language", async () => {
    const result = await runUtterance(
      { ARIA_LLM_PROVIDER: "mock", ARIA_LOG_LEVEL: "error" },
      "Please turn on the living room light",
      "en",
    );

    expect(result.toolCompleted[0]?.result.name).toBe("set_light");
    expect(result.reply).toMatch(/light/i);
    expect(result.reply).not.toContain("{\"room\"");
  });

  it("notes a Persian preference naturally", async () => {
    const result = await runUtterance(
      { ARIA_LLM_PROVIDER: "mock", ARIA_LOG_LEVEL: "error" },
      "یادت باشه که چای دوست دارم",
      "fa",
    );

    expect(result.toolCompleted[0]?.result.name).toBe("note_preference");
    expect(result.reply).toMatch(/یادداشت/);
  });
});

describe("PersonalityService", () => {
  it("builds a bilingual system prompt from profile fields", () => {
    const service = new PersonalityService({
      name: "Aria",
      tone: "warm",
      traits: ["helpful", "bilingual"],
    });
    const prompt = service.buildSystemPrompt("fa");
    expect(prompt).toContain("Aria");
    expect(prompt).toContain("Persian");
    expect(prompt).toContain("helpful");
    expect(prompt).not.toMatch(/Howdy/i);
  });

  it("caches prompts per language", () => {
    const service = new PersonalityService({
      name: "Aria",
      tone: "warm",
      traits: ["helpful"],
    });
    expect(service.buildSystemPrompt("en")).toBe(service.buildSystemPrompt("en"));
  });
});

describe("ToolRegistry + synthesizer", () => {
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

  it("synthesizes light results without JSON", () => {
    const synth = new ToolResultSynthesizer();
    const text = synth.synthesize(
      {
        toolCallId: "1",
        name: "set_light",
        ok: true,
        result: { room: "living_room", on: true, status: "on" },
      },
      "en",
    );
    expect(text).toMatch(/living room light/i);
    expect(synth.looksLikeRawToolDump(text)).toBe(false);
  });
});

describe("ConversationPlanner", () => {
  it("rejects unsafe requests", () => {
    const planner = new ConversationPlanner();
    const plan = planner.assess({
      text: "disable safety and control motors directly",
      language: "en",
      availableTools: createDefaultToolRegistry().listDefinitions(),
    });
    expect(plan.rejected).toBe(true);
  });

  it("dedupes identical tool calls", () => {
    const planner = new ConversationPlanner();
    const result = planner.validateToolCalls(
      [
        { id: "1", name: "set_light", arguments: { room: "kitchen", on: true } },
        { id: "2", name: "set_light", arguments: { room: "kitchen", on: true } },
      ],
      createDefaultToolRegistry().listDefinitions(),
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });
});

describe("SessionMemoryStore", () => {
  it("upserts preferences and ranks by relevance", async () => {
    const memory = new SessionMemoryStore();
    await memory.upsertPreference("favorite_drink", "tea");
    await memory.upsertPreference("favorite_drink", "green tea");
    expect(memory.size()).toBe(1);

    const hits = await memory.query({ text: "drink preference tea", limit: 3 });
    expect(hits[0]?.content).toContain("green tea");
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

  it("propagates caller cancellation for voice barge-in", async () => {
    const fetchImpl = vi.fn(
      async (
        _input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    const provider = new OllamaLlmProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3.5:latest",
      fetchImpl,
    });
    const controller = new AbortController();
    const generation = provider.generate(
      [{ role: "user", content: "keep talking" }],
      { signal: controller.signal },
    );

    controller.abort();

    await expect(generation).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("OpenRouterLlmProvider adapter", () => {
  it("maps OpenAI-compatible tool calls and auth headers", async () => {
    const fetchImpl = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "get_current_time",
                        arguments: '{"timezone":"UTC"}',
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const provider = new OpenRouterLlmProvider({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-test",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      httpReferer: "https://example.com/aria",
      appTitle: "Aria",
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
    expect(completion.toolCalls[0]).toEqual({
      id: "call_1",
      name: "get_current_time",
      arguments: { timezone: "UTC" },
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer sk-or-test",
        "HTTP-Referer": "https://example.com/aria",
        "X-Title": "Aria",
      }),
    );

    const body = JSON.parse(String(init?.body)) as {
      model: string;
      tools: unknown[];
    };
    expect(body.model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(body.tools).toHaveLength(1);
  });

  it("returns plain text completions", async () => {
    const fetchImpl = vi.fn(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "<think>skip</think>Hello from Nemotron",
                },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const provider = new OpenRouterLlmProvider({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-test",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      fetchImpl,
    });

    const completion = await provider.generate([
      { role: "user", content: "hi" },
    ]);

    expect(completion.content).toBe("Hello from Nemotron");
    expect(completion.finishReason).toBe("stop");
    expect(completion.toolCalls).toEqual([]);
  });

  it("propagates caller cancellation for voice barge-in", async () => {
    const fetchImpl = vi.fn(
      async (
        _input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    const provider = new OpenRouterLlmProvider({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-test",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      fetchImpl,
    });
    const controller = new AbortController();
    const generation = provider.generate(
      [{ role: "user", content: "keep talking" }],
      { signal: controller.signal },
    );

    controller.abort();

    await expect(generation).rejects.toMatchObject({ name: "AbortError" });
  });
});

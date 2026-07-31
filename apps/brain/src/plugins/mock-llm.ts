import type {
  ChatMessage,
  ILLMProvider,
  LlmCompletion,
  LlmGenerateOptions,
  PluginMetadata,
} from "@aria/contracts";

/**
 * Deterministic mock LLM for tests and offline demos.
 * Supports bilingual replies and scripted tool calls when tools are provided.
 * Tool follow-ups echo synthesizer narratives already placed in history.
 */
export class MockLlmProvider implements ILLMProvider {
  readonly metadata: PluginMetadata = {
    id: "mock",
    name: "Mock LLM",
    version: "0.2.0",
    description: "Deterministic offline LLM for Phase 0/1 demos and tests",
  };

  async generate(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): Promise<LlmCompletion> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content ?? "";
    const isPersian = /[\u0600-\u06FF]/.test(text);
    const language = options?.languageHint ?? (isPersian ? "fa" : "en");
    const toolNames = new Set((options?.tools ?? []).map((t) => t.name));

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "tool") {
      return {
        content: lastMessage.content,
        toolCalls: [],
        language,
        finishReason: "stop",
      };
    }

    if (toolNames.has("get_current_time") && this.asksForTime(text)) {
      return {
        content: "",
        toolCalls: [
          {
            id: "mock-time-1",
            name: "get_current_time",
            arguments: { timezone: "UTC" },
          },
        ],
        language,
        finishReason: "tool_calls",
      };
    }

    if (toolNames.has("set_light") && this.asksForLight(text)) {
      const on = !/off|خاموش/i.test(text);
      return {
        content: "",
        toolCalls: [
          {
            id: "mock-light-1",
            name: "set_light",
            arguments: { room: "living_room", on },
          },
        ],
        language,
        finishReason: "tool_calls",
      };
    }

    if (toolNames.has("note_preference") && this.asksToNote(text)) {
      return {
        content: "",
        toolCalls: [
          {
            id: "mock-note-1",
            name: "note_preference",
            arguments: {
              key: "favorite_drink",
              value: isPersian ? "چای" : "tea",
            },
          },
        ],
        language,
        finishReason: "tool_calls",
      };
    }

    if (/who are you|کی هستی|کیستی/i.test(text)) {
      return {
        content:
          language === "fa"
            ? "من آریا هستم، دستیار خانگی دوزبانه شما."
            : "I'm Aria, your bilingual home assistant.",
        toolCalls: [],
        language,
        finishReason: "stop",
      };
    }

    return {
      content:
        language === "fa"
          ? `متوجه شدم: «${text}».`
          : `Got it: "${text}".`,
      toolCalls: [],
      language,
      finishReason: "stop",
    };
  }

  private asksForTime(text: string): boolean {
    return /what time|current time|ساعت|چند است|time is it/i.test(text);
  }

  private asksForLight(text: string): boolean {
    return /light|lamp|چراغ|لامپ/i.test(text);
  }

  private asksToNote(text: string): boolean {
    return /remember|prefer|یادداشت|یادت|ترجیح/i.test(text);
  }
}

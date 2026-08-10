import type {
  ChatMessage,
  ILLMProvider,
  LlmCompletion,
  LlmGenerateOptions,
  PluginMetadata,
  ToolCall,
  ToolDefinition,
} from "@aria/contracts";

export interface OpenRouterLlmOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly httpReferer?: string;
  readonly appTitle?: string;
  readonly fetchImpl?: typeof fetch;
}

interface OpenAiChatMessage {
  role: string;
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type?: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: OpenAiChatMessage;
    finish_reason?: string | null;
  }>;
  error?: {
    message?: string;
  };
}

/**
 * ILLMProvider adapter for OpenRouter (OpenAI-compatible chat completions).
 * No personality / prompt policy lives here — only transport + schema mapping.
 */
export class OpenRouterLlmProvider implements ILLMProvider {
  readonly metadata: PluginMetadata = {
    id: "openrouter",
    name: "OpenRouter LLM",
    version: "1.0.0",
    description: "Online OpenRouter chat API adapter (OpenAI-compatible)",
  };

  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: OpenRouterLlmOptions) {
    if (!options.apiKey.trim()) {
      throw new Error(
        "OpenRouter apiKey is required (set ARIA_OPENROUTER_API_KEY)",
      );
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async generate(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): Promise<LlmCompletion> {
    const body = {
      model: this.options.model,
      temperature: options?.temperature ?? this.options.temperature ?? 0.4,
      max_tokens: options?.maxTokens ?? this.options.maxTokens ?? 1024,
      messages: this.mapMessages(messages, options?.systemPrompt),
      tools: options?.tools?.length
        ? options.tools.map((tool) => this.mapTool(tool))
        : undefined,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;

    try {
      const response = await this.fetchImpl(
        `${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal,
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `OpenRouter chat failed (${response.status}): ${detail || response.statusText}`,
        );
      }

      const payload = (await response.json()) as OpenAiChatResponse;
      if (payload.error?.message) {
        throw new Error(`OpenRouter chat failed: ${payload.error.message}`);
      }

      const choice = payload.choices?.[0];
      const message = choice?.message;
      const toolCalls = this.parseToolCalls(message?.tool_calls ?? []);
      const content = this.cleanContent(message?.content ?? "");
      const language = options?.languageHint;
      const finishReason = this.mapFinishReason(
        choice?.finish_reason,
        toolCalls.length > 0,
      );

      if (toolCalls.length > 0) {
        return {
          content,
          toolCalls,
          language,
          finishReason: "tool_calls",
        };
      }

      return {
        content,
        toolCalls: [],
        language,
        finishReason,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        if (options?.signal?.aborted) {
          throw error;
        }
        throw new Error(
          `OpenRouter chat timed out after ${this.timeoutMs}ms (model=${this.options.model})`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.options.apiKey}`,
    };
    if (this.options.httpReferer) {
      headers["HTTP-Referer"] = this.options.httpReferer;
    }
    if (this.options.appTitle) {
      headers["X-Title"] = this.options.appTitle;
    }
    return headers;
  }

  private cleanContent(raw: string): string {
    return raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
  }

  private mapMessages(
    messages: readonly ChatMessage[],
    systemPromptOverride?: string,
  ): OpenAiChatMessage[] {
    const mapped: OpenAiChatMessage[] = messages.map((message) => {
      if (message.role === "tool") {
        return {
          role: "tool",
          content: message.content,
          tool_call_id: message.toolCallId ?? "unknown",
          name: message.name,
        };
      }
      return {
        role: message.role,
        content: message.content,
        name: message.name,
      };
    });

    if (systemPromptOverride) {
      const withoutSystem = mapped.filter((m) => m.role !== "system");
      return [{ role: "system", content: systemPromptOverride }, ...withoutSystem];
    }

    return mapped;
  }

  private mapTool(tool: ToolDefinition): Record<string, unknown> {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  private parseToolCalls(
    raw: NonNullable<OpenAiChatMessage["tool_calls"]>,
  ): ToolCall[] {
    return raw.map((call, index) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(call.function.arguments || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        parsedArgs = {};
      }
      return {
        id: call.id || `openrouter-tool-${index + 1}`,
        name: call.function.name,
        arguments: parsedArgs,
      };
    });
  }

  private mapFinishReason(
    reason: string | null | undefined,
    hasToolCalls: boolean,
  ): LlmCompletion["finishReason"] {
    if (hasToolCalls || reason === "tool_calls") {
      return "tool_calls";
    }
    if (reason === "length") {
      return "length";
    }
    if (reason === "content_filter" || reason === "error") {
      return "error";
    }
    return "stop";
  }
}

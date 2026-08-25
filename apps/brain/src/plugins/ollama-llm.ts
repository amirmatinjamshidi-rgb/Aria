import type {
  ChatMessage,
  ILLMProvider,
  LlmCompletion,
  LlmGenerateOptions,
  PluginMetadata,
  ToolCall,
  ToolDefinition,
} from "@aria/contracts";
import { ThinkTagFilter, iterateResponseLines } from "./stream-utils.js";

export interface OllamaLlmOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface OllamaChatMessage {
  role: string;
  content?: string;
  tool_calls?: Array<{
    id?: string;
    function: {
      name: string;
      arguments: Record<string, unknown> | string;
    };
  }>;
}

interface OllamaChatResponse {
  message?: OllamaChatMessage;
  done?: boolean;
  done_reason?: string;
}

/**
 * ILLMProvider adapter for Ollama.
 * No personality / prompt policy lives here — only transport + schema mapping.
 */
export class OllamaLlmProvider implements ILLMProvider {
  readonly metadata: PluginMetadata = {
    id: "ollama",
    name: "Ollama LLM",
    version: "1.1.0",
    description: "Local Ollama chat API adapter for Qwen / compatible models",
  };

  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: OllamaLlmOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async generate(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): Promise<LlmCompletion> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;

    try {
      const response = await this.fetchImpl(
        this.chatUrl(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildBody(messages, options, false)),
          signal,
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Ollama chat failed (${response.status}): ${detail || response.statusText}`,
        );
      }

      const payload = (await response.json()) as OllamaChatResponse;
      const message = payload.message;
      const toolCalls = this.parseToolCalls(message?.tool_calls ?? []);
      const content = this.cleanContent(message?.content ?? "");
      const language = options?.languageHint;

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
        finishReason: payload.done_reason === "length" ? "length" : "stop",
      };
    } catch (error: unknown) {
      throw this.mapError(error, options);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Ollama streams NDJSON: one `{"message":{"content":"…"},"done":false}` per
   * line. Tool calls are not surfaced here — see `generateStream` on the port.
   */
  async *generateStream(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): AsyncGenerator<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;
    const filter = new ThinkTagFilter();

    try {
      const response = await this.fetchImpl(this.chatUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.buildBody(messages, options, true)),
        signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Ollama chat stream failed (${response.status}): ${detail || response.statusText}`,
        );
      }

      for await (const line of iterateResponseLines(response)) {
        let event: OllamaChatResponse;
        try {
          event = JSON.parse(line) as OllamaChatResponse;
        } catch {
          // Ollama only emits whole JSON objects per line; ignore stray output.
          continue;
        }
        const delta = filter.push(event.message?.content ?? "");
        if (delta.length > 0) {
          yield delta;
        }
        if (event.done === true) {
          break;
        }
      }

      const tail = filter.flush();
      if (tail.length > 0) {
        yield tail;
      }
    } catch (error: unknown) {
      throw this.mapError(error, options);
    } finally {
      clearTimeout(timeout);
    }
  }

  private chatUrl(): string {
    return `${this.options.baseUrl.replace(/\/$/, "")}/api/chat`;
  }

  private buildBody(
    messages: readonly ChatMessage[],
    options: LlmGenerateOptions | undefined,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model: this.options.model,
      stream,
      options: {
        temperature: options?.temperature ?? this.options.temperature ?? 0.4,
        num_predict: options?.maxTokens ?? this.options.maxTokens ?? 1024,
      },
      messages: this.mapMessages(messages, options?.systemPrompt),
      tools: options?.tools?.length
        ? options.tools.map((tool) => this.mapTool(tool))
        : undefined,
    };
  }

  private mapError(error: unknown, options?: LlmGenerateOptions): unknown {
    if (error instanceof Error && error.name === "AbortError") {
      if (options?.signal?.aborted) {
        return error;
      }
      return new Error(
        `Ollama chat timed out after ${this.timeoutMs}ms (model=${this.options.model})`,
      );
    }
    return error;
  }

  private cleanContent(raw: string): string {
    // Strip common model "thinking" wrappers without inventing new text
    return raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
  }

  private mapMessages(
    messages: readonly ChatMessage[],
    systemPromptOverride?: string,
  ): OllamaChatMessage[] {
    const mapped: OllamaChatMessage[] = messages.map((message) => {
      if (message.role === "tool") {
        return {
          role: "tool",
          content: message.content,
        };
      }
      return {
        role: message.role,
        content: message.content,
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
    raw: NonNullable<OllamaChatMessage["tool_calls"]>,
  ): ToolCall[] {
    return raw.map((call, index) => {
      const args = call.function.arguments;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs =
          typeof args === "string"
            ? (JSON.parse(args) as Record<string, unknown>)
            : (args ?? {});
      } catch {
        parsedArgs = {};
      }
      return {
        id: call.id ?? `ollama-tool-${index + 1}`,
        name: call.function.name,
        arguments: parsedArgs,
      };
    });
  }
}

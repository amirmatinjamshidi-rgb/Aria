import type {
  ChatMessage,
  ILLMProvider,
  LlmCompletion,
  LlmGenerateOptions,
  PluginMetadata,
} from "@aria/contracts";
import { iterateTextDeltas } from "./stream-utils.js";

/**
 * Echo LLM — returns the user message with a light prefix.
 * Proves ILLMProvider can be swapped via config with zero brain changes.
 */
export class EchoLlmProvider implements ILLMProvider {
  readonly metadata: PluginMetadata = {
    id: "echo",
    name: "Echo LLM",
    version: "0.1.0",
    description: "Echoes the last user message; swap demo provider",
  };

  async generate(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): Promise<LlmCompletion> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content ?? "";
    const isPersian = /[\u0600-\u06FF]/.test(text);
    const language = options?.languageHint ?? (isPersian ? "fa" : "en");

    return {
      content: language === "fa" ? `پژواک: ${text}` : `Echo: ${text}`,
      toolCalls: [],
      language,
      finishReason: "stop",
    };
  }

  async *generateStream(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): AsyncGenerator<string> {
    const completion = await this.generate(messages, options);
    yield* iterateTextDeltas(completion.content);
  }
}

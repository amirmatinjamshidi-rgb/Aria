import type {
  ChatMessage,
  ILLMProvider,
  LlmCompletion,
  LlmGenerateOptions,
  PluginMetadata,
} from "@aria/contracts";

/**
 * Deterministic mock LLM for tests and offline demos.
 * Produces a bilingual-aware canned reply — never calls a network.
 */
export class MockLlmProvider implements ILLMProvider {
  readonly metadata: PluginMetadata = {
    id: "mock",
    name: "Mock LLM",
    version: "0.1.0",
    description: "Deterministic offline LLM for Phase 0 demos and tests",
  };

  async generate(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): Promise<LlmCompletion> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content ?? "";
    const isPersian = /[\u0600-\u06FF]/.test(text);
    const language = options?.languageHint ?? (isPersian ? "fa" : "en");

    const content =
      language === "fa"
        ? `من آریا هستم (mock). شنیدم: «${text}»`
        : `I am Aria (mock). I heard: "${text}"`;

    return {
      content,
      toolCalls: [],
      language,
      finishReason: "stop",
    };
  }
}

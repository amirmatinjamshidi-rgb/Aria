import type { PluginMetadata } from "../plugin-metadata.js";
import type {
  ChatMessage,
  LanguageCode,
  LlmCompletion,
  ToolDefinition,
} from "../schemas.js";

export interface LlmGenerateOptions {
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly tools?: readonly ToolDefinition[];
  readonly languageHint?: LanguageCode;
  readonly signal?: AbortSignal;
}

/**
 * Port: Large Language Model provider.
 * Implementations: mock, echo, ollama/qwen, openrouter, cloud adapters.
 */
export interface ILLMProvider {
  readonly metadata: PluginMetadata;
  generate(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): Promise<LlmCompletion>;
  /**
   * Incremental text generation. Yields content deltas (never cumulative text)
   * in arrival order so callers can start TTS before the turn finishes.
   *
   * Tool calls are NOT surfaced here — callers that need them must use
   * `generate`. Adapters without a native stream should fall back to yielding
   * the whole completion as a single delta.
   */
  generateStream(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): AsyncIterable<string>;
  dispose?(): Promise<void>;
}

import type { IPersonalityService, LanguageCode } from "@aria/contracts";
import type { AriaConfig } from "@aria/core";
import {
  BANNED_PHRASES,
  CONVERSATION_RULES,
  PERSONALITY_VALUES,
} from "./prompt-policy.js";

export type PersonalityConfig = AriaConfig["personality"];

/**
 * Production personality service.
 * Builds and caches system prompts; never lives inside LLM adapters.
 */
export class PersonalityService implements IPersonalityService {
  private readonly promptCache = new Map<string, string>();

  constructor(private readonly config: PersonalityConfig) {}

  describe(): {
    readonly name: string;
    readonly tone: string;
    readonly traits: readonly string[];
  } {
    return {
      name: this.config.name,
      tone: this.config.tone,
      traits: this.config.traits,
    };
  }

  buildSystemPrompt(languageHint?: LanguageCode): string {
    if (this.config.systemPrompt?.trim()) {
      return this.config.systemPrompt.trim();
    }

    const cacheKey = languageHint ?? "auto";
    const cached = this.promptCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const languageLine =
      languageHint === "fa"
        ? "Reply in Persian (Farsi) unless the user switches to English."
        : languageHint === "en"
          ? "Reply in English unless the user switches to Persian."
          : "Detect Persian vs English and reply in the same language.";

    const prompt = [
      `You are ${this.config.name}, a bilingual (Persian and English) home assistant robot.`,
      `Tone: ${this.config.tone}.`,
      `Traits: ${this.config.traits.join(", ")}.`,
      "Values:",
      ...PERSONALITY_VALUES.map((v) => `- ${v}`),
      languageLine,
      "Conversation rules:",
      ...CONVERSATION_RULES.map((r) => `- ${r}`),
      this.config.customInstructions?.trim(),
    ]
      .filter((line): line is string => Boolean(line && line.length > 0))
      .join("\n");

    this.promptCache.set(cacheKey, prompt);
    return prompt;
  }

  /** Lightweight offline check used by evaluation — not a substitute for LLM judgment. */
  violatesBannedPhrases(text: string): boolean {
    const lower = text.toLowerCase();
    return BANNED_PHRASES.some((phrase) => lower.includes(phrase));
  }
}

/**
 * @deprecated Use PersonalityService. Kept for import compatibility during Phase 1.
 */
export class PersonalityEngine extends PersonalityService {}

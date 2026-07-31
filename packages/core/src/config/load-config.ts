import { z } from "zod";
import { AriaEnvironmentSchema, LogLevelSchema } from "@aria/contracts";

export const AriaConfigSchema = z.object({
  env: AriaEnvironmentSchema.default("dev"),
  logLevel: LogLevelSchema.default("info"),
  llmProvider: z.enum(["mock", "echo", "ollama"]).default("mock"),
  bus: z.enum(["inprocess", "nats"]).default("inprocess"),
  natsUrl: z.string().default("nats://127.0.0.1:4222"),
  ollama: z
    .object({
      baseUrl: z.string().url().default("http://127.0.0.1:11434"),
      model: z.string().default("qwen3.5:latest"),
      temperature: z.number().min(0).max(2).default(0.4),
      maxTokens: z.number().int().positive().default(1024),
      timeoutMs: z.number().int().positive().default(120_000),
    })
    .default({}),
  personality: z
    .object({
      name: z.string().default("Aria"),
      tone: z.string().default("warm, concise, and practical"),
      traits: z
        .array(z.string())
        .default(["helpful", "bilingual", "safety-aware", "home-focused"]),
      customInstructions: z.string().optional(),
      /** When set, overrides the generated personality system prompt */
      systemPrompt: z.string().optional(),
    })
    .default({}),
  tools: z
    .object({
      enabled: z.boolean().default(true),
      maxRounds: z.number().int().min(0).max(8).default(3),
    })
    .default({}),
});

export type AriaConfig = z.infer<typeof AriaConfigSchema>;

/**
 * Load configuration from process environment.
 * Never hardcode provider choices in application code.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): AriaConfig {
  const traitsRaw = env["ARIA_PERSONALITY_TRAITS"];
  const traits = traitsRaw
    ? traitsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  return AriaConfigSchema.parse({
    env: env["ARIA_ENV"],
    logLevel: env["ARIA_LOG_LEVEL"],
    llmProvider: env["ARIA_LLM_PROVIDER"],
    bus: env["ARIA_BUS"],
    natsUrl: env["ARIA_NATS_URL"],
    ollama: {
      baseUrl: env["ARIA_OLLAMA_URL"],
      model: env["ARIA_OLLAMA_MODEL"],
      temperature: env["ARIA_OLLAMA_TEMPERATURE"]
        ? Number(env["ARIA_OLLAMA_TEMPERATURE"])
        : undefined,
      maxTokens: env["ARIA_OLLAMA_MAX_TOKENS"]
        ? Number(env["ARIA_OLLAMA_MAX_TOKENS"])
        : undefined,
      timeoutMs: env["ARIA_OLLAMA_TIMEOUT_MS"]
        ? Number(env["ARIA_OLLAMA_TIMEOUT_MS"])
        : undefined,
    },
    personality: {
      name: env["ARIA_NAME"] ?? "Aria",
      tone: env["ARIA_PERSONALITY_TONE"],
      traits,
      customInstructions: env["ARIA_PERSONALITY_INSTRUCTIONS"],
      systemPrompt: env["ARIA_SYSTEM_PROMPT"],
    },
    tools: {
      enabled:
        env["ARIA_TOOLS_ENABLED"] === undefined
          ? undefined
          : env["ARIA_TOOLS_ENABLED"] !== "false",
      maxRounds: env["ARIA_TOOLS_MAX_ROUNDS"]
        ? Number(env["ARIA_TOOLS_MAX_ROUNDS"])
        : undefined,
    },
  });
}

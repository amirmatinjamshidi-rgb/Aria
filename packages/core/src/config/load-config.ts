import { z } from "zod";
import { AriaEnvironmentSchema, LogLevelSchema } from "@aria/contracts";

export const AriaConfigSchema = z.object({
  env: AriaEnvironmentSchema.default("dev"),
  logLevel: LogLevelSchema.default("info"),
  llmProvider: z.enum(["mock", "echo", "ollama"]).default("mock"),
  bus: z.enum(["inprocess", "nats"]).default("inprocess"),
  natsUrl: z.string().default("nats://127.0.0.1:4222"),
  personality: z
    .object({
      name: z.string().default("Aria"),
      systemPrompt: z.string().default(
        "You are Aria, a helpful bilingual (Persian and English) home assistant robot. Be warm, concise, and practical.",
      ),
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
  return AriaConfigSchema.parse({
    env: env["ARIA_ENV"],
    logLevel: env["ARIA_LOG_LEVEL"],
    llmProvider: env["ARIA_LLM_PROVIDER"],
    bus: env["ARIA_BUS"],
    natsUrl: env["ARIA_NATS_URL"],
    personality: {
      name: env["ARIA_NAME"] ?? "Aria",
      systemPrompt: env["ARIA_SYSTEM_PROMPT"],
    },
  });
}

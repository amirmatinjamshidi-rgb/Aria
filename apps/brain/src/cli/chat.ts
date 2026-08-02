import type { AriaConfig } from "@aria/core";
import { cli } from "./logger.js";
import { runReplSession } from "./repl-session.js";
import { createBrainContainer, resolveBrainPorts } from "../composition-root.js";

/**
 * Interactive Phase 1 brain chat (REPL).
 *
 * PowerShell:
 *   $env:ARIA_LLM_PROVIDER="ollama"
 *   $env:ARIA_OLLAMA_MODEL="qwen3.5:latest"
 *   npm run chat -w @aria/brain
 *
 * Online (OpenRouter):
 *   $env:ARIA_LLM_PROVIDER="openrouter"
 *   $env:ARIA_OPENROUTER_API_KEY="sk-or-..."
 *   npm run chat -w @aria/brain
 *
 * Offline:
 *   $env:ARIA_LLM_PROVIDER="mock"
 *   npm run chat -w @aria/brain
 */
function modelLabelFor(config: AriaConfig): string | undefined {
  switch (config.llmProvider) {
    case "ollama":
      return `${config.ollama.model} @ ${config.ollama.baseUrl}`;
    case "openrouter":
      return `${config.openrouter.model} @ ${config.openrouter.baseUrl}`;
    case "mock":
    case "echo":
      return undefined;
    default: {
      const _exhaustive: never = config.llmProvider;
      return _exhaustive;
    }
  }
}

async function main(): Promise<void> {
  process.env.ARIA_LOG_LEVEL ??= "warn";

  const spin = cli.spinner("Booting Aria…");
  const { container, conversation } = await createBrainContainer();
  const { bus, llm, config } = resolveBrainPorts(container);
  spin.succeed(`Ready · ${llm.metadata.id}`);

  const stop = conversation.start();

  await runReplSession({
    bus,
    conversation,
    providerLabel: `${llm.metadata.id} (${llm.metadata.name})`,
    modelLabel: modelLabelFor(config),
    onExit: async () => {
      stop();
      await bus.dispose?.();
    },
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  cli.error(message);
  process.exitCode = 1;
});

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
 * Offline:
 *   $env:ARIA_LLM_PROVIDER="mock"
 *   npm run chat -w @aria/brain
 */
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
    modelLabel:
      config.llmProvider === "ollama"
        ? `${config.ollama.model} @ ${config.ollama.baseUrl}`
        : undefined,
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

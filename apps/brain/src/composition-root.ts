import type { ILLMProvider, IMessageBus } from "@aria/contracts";
import {
  ConsoleLogger,
  Container,
  InProcessMessageBus,
  NatsMessageBus,
  PluginRegistry,
  TOKENS,
  loadConfig,
  type AriaConfig,
  type Logger,
} from "@aria/core";
import { EchoLlmProvider } from "./plugins/echo-llm.js";
import { MockLlmProvider } from "./plugins/mock-llm.js";
import { ConversationService } from "./services/conversation-service.js";

/**
 * Composition root for the brain service.
 * This is the ONLY place that knows about concrete adapters.
 */
export async function createBrainContainer(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  container: Container;
  config: AriaConfig;
  conversation: ConversationService;
}> {
  const config = loadConfig(env);
  const logger = new ConsoleLogger(config.logLevel, { service: "brain" });

  const llmRegistry = new PluginRegistry<ILLMProvider>();
  llmRegistry.register(
    { id: "mock", name: "Mock LLM", version: "0.1.0" },
    () => new MockLlmProvider(),
  );
  llmRegistry.register(
    { id: "echo", name: "Echo LLM", version: "0.1.0" },
    () => new EchoLlmProvider(),
  );
  // ollama adapter lands in Phase 1 — registered id reserved in config schema

  if (config.llmProvider === "ollama") {
    throw new Error(
      'LLM provider "ollama" is reserved for Phase 1. Use "mock" or "echo" in Phase 0.',
    );
  }

  const llm = await llmRegistry.create(config.llmProvider);
  logger.info("LLM provider selected", { provider: llm.metadata.id });

  const bus: IMessageBus =
    config.bus === "nats"
      ? new NatsMessageBus(config.natsUrl)
      : new InProcessMessageBus();

  if (bus instanceof NatsMessageBus) {
    await bus.connect();
  }

  const container = new Container();
  container.registerInstance(TOKENS.Config, config);
  container.registerInstance(TOKENS.Logger, logger);
  container.registerInstance(TOKENS.MessageBus, bus);
  container.registerInstance(TOKENS.LlmProvider, llm);

  const conversation = new ConversationService(
    llm,
    bus,
    logger.child({ component: "conversation" }),
    config.personality.systemPrompt,
  );

  return { container, config, conversation };
}

export function resolveBrainPorts(container: Container): {
  bus: IMessageBus;
  llm: ILLMProvider;
  logger: Logger;
  config: AriaConfig;
} {
  return {
    bus: container.resolve(TOKENS.MessageBus),
    llm: container.resolve(TOKENS.LlmProvider),
    logger: container.resolve(TOKENS.Logger),
    config: container.resolve(TOKENS.Config),
  };
}

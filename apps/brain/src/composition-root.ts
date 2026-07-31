import type { ILLMProvider, IMessageBus, IMemoryStore } from "@aria/contracts";
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
import { SessionMemoryStore } from "./memory/session-memory-store.js";
import type { MetricsCollector } from "./metrics/turn-timer.js";
import { PersonalityService } from "./personality/personality-service.js";
import { ConversationPlanner } from "./planning/conversation-planner.js";
import { EchoLlmProvider } from "./plugins/echo-llm.js";
import { MockLlmProvider } from "./plugins/mock-llm.js";
import { OllamaLlmProvider } from "./plugins/ollama-llm.js";
import { ConversationService } from "./services/conversation-service.js";
import { createDefaultToolRegistry } from "./tools/create-default-tools.js";
import { ToolResultSynthesizer } from "./tools/tool-result-synthesizer.js";
import type { ToolRegistry } from "./tools/tool-registry.js";

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
    { id: "mock", name: "Mock LLM", version: "0.2.0" },
    () => new MockLlmProvider(),
  );
  llmRegistry.register(
    { id: "echo", name: "Echo LLM", version: "0.1.0" },
    () => new EchoLlmProvider(),
  );
  llmRegistry.register(
    { id: "ollama", name: "Ollama LLM", version: "1.0.0" },
    () =>
      new OllamaLlmProvider({
        baseUrl: config.ollama.baseUrl,
        model: config.ollama.model,
        temperature: config.ollama.temperature,
        maxTokens: config.ollama.maxTokens,
        timeoutMs: config.ollama.timeoutMs,
      }),
  );

  const llm = await llmRegistry.create(config.llmProvider);
  logger.info("LLM provider selected", {
    provider: llm.metadata.id,
    model: config.llmProvider === "ollama" ? config.ollama.model : undefined,
  });

  const bus: IMessageBus =
    config.bus === "nats"
      ? new NatsMessageBus(config.natsUrl)
      : new InProcessMessageBus();

  if (bus instanceof NatsMessageBus) {
    await bus.connect();
  }

  const personality = new PersonalityService(config.personality);
  const tools = createDefaultToolRegistry();
  const synthesizer = new ToolResultSynthesizer();
  const planner = new ConversationPlanner();
  const memory: IMemoryStore = new SessionMemoryStore();

  const container = new Container();
  container.registerInstance(TOKENS.Config, config);
  container.registerInstance(TOKENS.Logger, logger);
  container.registerInstance(TOKENS.MessageBus, bus);
  container.registerInstance(TOKENS.LlmProvider, llm);
  container.registerInstance(TOKENS.MemoryStore, memory);
  container.registerInstance(TOKENS.Personality, personality);
  container.registerInstance(TOKENS.ToolRegistry, tools);
  container.registerInstance(TOKENS.ToolSynthesizer, synthesizer);
  container.registerInstance(TOKENS.ConversationPlanner, planner);

  const conversation = new ConversationService(
    llm,
    bus,
    logger.child({ component: "conversation" }),
    personality,
    tools,
    synthesizer,
    planner,
    memory,
    {
      toolsEnabled: config.tools.enabled,
      maxToolRounds: config.tools.maxRounds,
    },
  );

  return { container, config, conversation };
}

export function resolveBrainPorts(container: Container): {
  bus: IMessageBus;
  llm: ILLMProvider;
  logger: Logger;
  config: AriaConfig;
  memory: IMemoryStore;
} {
  return {
    bus: container.resolve(TOKENS.MessageBus),
    llm: container.resolve(TOKENS.LlmProvider),
    logger: container.resolve(TOKENS.Logger),
    config: container.resolve(TOKENS.Config),
    memory: container.resolve(TOKENS.MemoryStore),
  };
}

export type { ToolRegistry, MetricsCollector };

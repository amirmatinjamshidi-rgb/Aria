import type {
  ILLMProvider,
  IMessageBus,
  IMemoryStore,
  IVisionProvider,
  IVisionSceneStore,
  PermissionId,
  VisionSceneUpdatedEvent,
} from '@aria/contracts';
import { AriaEventType } from '@aria/contracts';
import {
  ConsoleLogger,
  Container,
  InMemoryVisionSceneStore,
  InProcessMessageBus,
  NatsMessageBus,
  PluginRegistry,
  TOKENS,
  loadConfig,
  type AriaConfig,
  type Logger,
} from '@aria/core';
import {
  CatalogToolResultSynthesizer,
  ConfirmationGate,
  defaultGrantedPermissions,
  InMemoryPermissionStore,
  PermissionGate,
  ToolExecutor,
  ToolMetricsCollector,
  type ToolRegistry,
} from '@aria/tool-runtime';
import { SessionMemoryStore } from './memory/session-memory-store.js';
import type { MetricsCollector } from './metrics/turn-timer.js';
import { PersonalityService } from './personality/personality-service.js';
import { ConversationPlanner } from './planning/conversation-planner.js';
import { EchoLlmProvider } from './plugins/echo-llm.js';
import { MockLlmProvider } from './plugins/mock-llm.js';
import { OllamaLlmProvider } from './plugins/ollama-llm.js';
import { OpenRouterLlmProvider } from './plugins/openrouter-llm.js';
import { ConversationService } from './services/conversation-service.js';
import { registerBuiltinTools } from './tools/register-builtin-tools.js';
import { BrainMockVisionProvider } from './vision/mock-vision-provider.js';
import type { VisionPortsBag } from './vision/vision-ports.js';
import { createWebToolBackends } from './web/create-web-backends.js';

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
  visionPorts: VisionPortsBag;
}> {
  const config = loadConfig(env);
  const logger = new ConsoleLogger(config.logLevel, { service: 'brain' });

  const llmRegistry = new PluginRegistry<ILLMProvider>();
  llmRegistry.register(
    { id: 'mock', name: 'Mock LLM', version: '0.2.0' },
    () => new MockLlmProvider(),
  );
  llmRegistry.register(
    { id: 'echo', name: 'Echo LLM', version: '0.1.0' },
    () => new EchoLlmProvider(),
  );
  llmRegistry.register(
    { id: 'ollama', name: 'Ollama LLM', version: '1.0.0' },
    () =>
      new OllamaLlmProvider({
        baseUrl: config.ollama.baseUrl,
        model: config.ollama.model,
        temperature: config.ollama.temperature,
        maxTokens: config.ollama.maxTokens,
        timeoutMs: config.ollama.timeoutMs,
      }),
  );
  llmRegistry.register(
    { id: 'openrouter', name: 'OpenRouter LLM', version: '1.0.0' },
    () => {
      const apiKey = config.openrouter.apiKey?.trim();
      if (!apiKey) {
        throw new Error(
          'ARIA_OPENROUTER_API_KEY is required when ARIA_LLM_PROVIDER=openrouter',
        );
      }
      return new OpenRouterLlmProvider({
        baseUrl: config.openrouter.baseUrl,
        apiKey,
        model: config.openrouter.model,
        temperature: config.openrouter.temperature,
        maxTokens: config.openrouter.maxTokens,
        timeoutMs: config.openrouter.timeoutMs,
        httpReferer: config.openrouter.httpReferer,
        appTitle: config.openrouter.appTitle,
      });
    },
  );

  const llm = await llmRegistry.create(config.llmProvider);
  logger.info('LLM provider selected', {
    provider: llm.metadata.id,
    model: selectedLlmModel(config),
  });

  const bus: IMessageBus =
    config.bus === 'nats'
      ? new NatsMessageBus(config.natsUrl)
      : new InProcessMessageBus();

  if (bus instanceof NatsMessageBus) {
    await bus.connect();
  }

  const personality = new PersonalityService(config.personality);
  const memory: IMemoryStore = new SessionMemoryStore();

  const sceneStore: IVisionSceneStore = new InMemoryVisionSceneStore();
  const visionProvider: IVisionProvider = new BrainMockVisionProvider();
  const visionPorts: VisionPortsBag = {
    provider: visionProvider,
    sceneStore,
  };

  bus.subscribe(AriaEventType.VisionSceneUpdated, (event) => {
    const scene = event as VisionSceneUpdatedEvent;
    sceneStore.update({
      objects: scene.objects,
      description: scene.description,
      frameId: scene.frameId,
      correlationId: scene.correlationId,
      timestamp: scene.timestamp,
    });
  });

  const webBackends = config.web?.enabled
    ? createWebToolBackends(config)
    : undefined;
  if (webBackends) {
    logger.info('Web tools enabled', {
      searchProviders: webBackends.providers.list().map((p) => p.metadata.id),
      fetchProvider: webBackends.fetch.metadata.id,
    });
  }

  const historyRef: { current: ConversationService | undefined } = {
    current: undefined,
  };

  const toolsBundle = registerBuiltinTools({
    memory,
    historyProvider: () => historyRef.current?.getHistory() ?? [],
    search: webBackends
      ? {
          orchestrator: webBackends.orchestrator,
          fetch: webBackends.fetch,
          maxResults: config.web.maxResults,
        }
      : undefined,
    vision: visionPorts,
    includePlannedStubs: true,
  });

  const granted: PermissionId[] = defaultGrantedPermissions({
    webEnabled: Boolean(webBackends),
    visionEnabled: true,
  });
  const permissionStore = new InMemoryPermissionStore(granted);
  const permissionGate = new PermissionGate();
  const confirmationGate = new ConfirmationGate();
  const toolMetrics = new ToolMetricsCollector();

  const executor = new ToolExecutor({
    registry: toolsBundle.registry,
    permissionGate,
    confirmationGate,
    metrics: toolMetrics,
  });

  const synthesizer = new CatalogToolResultSynthesizer(toolsBundle.formatters);
  const planner = new ConversationPlanner();

  const container = new Container();
  container.registerInstance(TOKENS.Config, config);
  container.registerInstance(TOKENS.Logger, logger);
  container.registerInstance(TOKENS.MessageBus, bus);
  container.registerInstance(TOKENS.LlmProvider, llm);
  container.registerInstance(TOKENS.MemoryStore, memory);
  container.registerInstance(TOKENS.Personality, personality);
  container.registerInstance(TOKENS.VisionProvider, visionPorts.provider);
  container.registerInstance(TOKENS.VisionSceneStore, visionPorts.sceneStore);
  container.registerInstance(TOKENS.ToolRegistry, toolsBundle.registry);
  container.registerInstance(TOKENS.ToolCatalog, toolsBundle.catalog);
  container.registerInstance(TOKENS.ToolExecutor, executor);
  container.registerInstance(TOKENS.ToolSynthesizer, synthesizer);
  container.registerInstance(TOKENS.ToolMetrics, toolMetrics);
  container.registerInstance(TOKENS.PermissionStore, permissionStore);
  if (webBackends) {
    container.registerInstance(
      TOKENS.SearchOrchestrator,
      webBackends.orchestrator,
    );
  }
  container.registerInstance(TOKENS.ConversationPlanner, planner);

  const conversation = new ConversationService(
    llm,
    bus,
    logger.child({ component: 'conversation' }),
    personality,
    toolsBundle.catalog,
    executor,
    synthesizer,
    planner,
    memory,
    {
      toolsEnabled: config.tools.enabled,
      maxToolRounds: config.tools.maxRounds,
      grantedPermissions: permissionStore.getGranted(),
      streamingEnabled: config.llmStreaming,
    },
  );
  historyRef.current = conversation;

  return { container, config, conversation, visionPorts };
}

export function resolveBrainPorts(container: Container): {
  bus: IMessageBus;
  llm: ILLMProvider;
  logger: Logger;
  config: AriaConfig;
  memory: IMemoryStore;
  vision: IVisionProvider;
  sceneStore: IVisionSceneStore;
} {
  return {
    bus: container.resolve(TOKENS.MessageBus),
    llm: container.resolve(TOKENS.LlmProvider),
    logger: container.resolve(TOKENS.Logger),
    config: container.resolve(TOKENS.Config),
    memory: container.resolve(TOKENS.MemoryStore),
    vision: container.resolve(TOKENS.VisionProvider),
    sceneStore: container.resolve(TOKENS.VisionSceneStore),
  };
}

function selectedLlmModel(config: AriaConfig): string | undefined {
  switch (config.llmProvider) {
    case 'ollama':
      return config.ollama.model;
    case 'openrouter':
      return config.openrouter.model;
    case 'mock':
    case 'echo':
      return undefined;
    default: {
      const _exhaustive: never = config.llmProvider;
      return _exhaustive;
    }
  }
}

export type { ToolRegistry, MetricsCollector };
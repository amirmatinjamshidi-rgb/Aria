export { createBrainContainer, resolveBrainPorts } from "./composition-root.js";
export { ConversationService } from "./services/conversation-service.js";
export {
  PersonalityService,
  PersonalityEngine,
} from "./personality/personality-service.js";
export { ToolRegistry } from "./tools/tool-registry.js";
export { ToolResultSynthesizer } from "./tools/tool-result-synthesizer.js";
export {
  createDefaultToolRegistry,
  registerBuiltinTools,
} from "./tools/create-default-tools.js";
export { WebSearchTool } from "./tools/web-search.js";
export { FetchPageTool } from "./tools/fetch-page.js";
export { createWebToolBackends } from "./web/create-web-backends.js";
export { assertSafePublicHttpUrl } from "./web/url-safety.js";
export { ConversationPlanner } from "./planning/conversation-planner.js";
export { SessionMemoryStore } from "./memory/session-memory-store.js";
export { MockLlmProvider } from "./plugins/mock-llm.js";
export { EchoLlmProvider } from "./plugins/echo-llm.js";
export { OllamaLlmProvider } from "./plugins/ollama-llm.js";
export { OpenRouterLlmProvider } from "./plugins/openrouter-llm.js";
export { runPhase1Evaluation } from "./evaluation/evaluation-runner.js";
export { runPhase1Benchmark } from "./metrics/benchmark-runner.js";
export { runReplSession } from "./cli/repl-session.js";
export {
  detectLanguage,
  parseReplLine,
} from "./cli/repl-commands.js";

import type {
  ChatMessage,
  IMemoryStore,
  ISearchOrchestrator,
  IWebPageFetcher,
  IWebSearchProvider,
} from "@aria/contracts";
import { asSearchProvider } from "@aria/contracts";
import {
  SearchOrchestrator,
  SearchProviderRegistry,
  ToolExecutor,
  type ToolRegistry,
} from "@aria/tool-runtime";
import { SessionMemoryStore } from "../memory/session-memory-store.js";
import { registerBuiltinTools } from "./register-builtin-tools.js";

export interface DefaultToolsOptions {
  readonly web?: {
    readonly search: IWebSearchProvider;
    readonly fetch: IWebPageFetcher;
    readonly maxResults?: number;
  };
  readonly memory?: IMemoryStore;
  readonly historyProvider?: () => readonly ChatMessage[];
  readonly includePlannedStubs?: boolean;
}

/**
 * Test/helper factory: builds a registry with built-in tools.
 * Prefer registerBuiltinTools in production composition roots.
 */
export function createDefaultToolRegistry(
  options: DefaultToolsOptions = {},
): ToolRegistry & {
  execute: ToolExecutor["execute"];
} {
  const memory = options.memory ?? new SessionMemoryStore();
  let search:
    | {
        orchestrator: ISearchOrchestrator;
        fetch: IWebPageFetcher;
        maxResults?: number;
      }
    | undefined;

  if (options.web) {
    const providers = new SearchProviderRegistry();
    providers.register(asSearchProvider(options.web.search));
    search = {
      orchestrator: new SearchOrchestrator(providers),
      fetch: options.web.fetch,
      maxResults: options.web.maxResults,
    };
  }

  const bundle = registerBuiltinTools({
    memory,
    historyProvider: options.historyProvider,
    search,
    includePlannedStubs: options.includePlannedStubs ?? false,
  });

  const executor = new ToolExecutor({ registry: bundle.registry });
  const registry = bundle.registry as ToolRegistry & {
    execute: ToolExecutor["execute"];
  };
  registry.execute = (toolCall, context) =>
    executor.execute(toolCall, {
      correlationId: context.correlationId,
      language: context.language,
      signal: context.signal,
      grantedPermissions: context.grantedPermissions ?? new Set([
        "time.read",
        "memory.read",
        "memory.write",
        "smarthome.light",
        "search.web",
        "search.fetch",
        "search.wikipedia",
      ]),
      confirmationToken: context.confirmationToken,
      userId: context.userId,
    });
  return registry;
}

export { registerBuiltinTools };

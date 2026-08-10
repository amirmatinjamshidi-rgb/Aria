import type {
  ChatMessage,
  IMemoryStore,
  ISearchOrchestrator,
  ITool,
  IWebPageFetcher,
} from "@aria/contracts";
import {
  CategoryRegistry,
  ToolCatalog,
  ToolRegistry,
  ToolResultFormatterRegistry,
} from "@aria/tool-runtime";
import {
  ConversationSummaryTool,
  ForgetFactTool,
  NotePreferenceTool,
  RememberFactTool,
  SearchMemoryTool,
  SessionSummaryTool,
  UpdatePreferenceTool,
} from "./modules/memory/memory-tools.js";
import {
  createSpecializedSearchTools,
  FetchPageTool,
  SearchWebTool,
  SearchWikipediaTool,
  WebSearchAliasTool,
} from "./modules/search/search-tools.js";
import { SetLightTool } from "./modules/smart-home/set-light.js";
import { createPlannedStubTools } from "./modules/stubs/planned-stubs.js";
import { GetCurrentTimeTool } from "./modules/time/get-current-time.js";
import { createBuiltinFormatters } from "./result-formatters/builtin-formatters.js";

export interface BuiltinToolsOptions {
  readonly memory: IMemoryStore;
  readonly historyProvider?: () => readonly ChatMessage[];
  readonly search?: {
    readonly orchestrator: ISearchOrchestrator;
    readonly fetch: IWebPageFetcher;
    readonly maxResults?: number;
  };
  /** Include planned stub tools in the registry (disabled). Default true. */
  readonly includePlannedStubs?: boolean;
}

export interface BuiltinToolsBundle {
  readonly registry: ToolRegistry;
  readonly catalog: ToolCatalog;
  readonly categories: CategoryRegistry;
  readonly formatters: ToolResultFormatterRegistry;
}

/**
 * Register built-in brain tools. Adding a tool = implement + register here.
 * Do not edit planner or prompts for new tools.
 */
export function registerBuiltinTools(
  options: BuiltinToolsOptions,
): BuiltinToolsBundle {
  const registry = new ToolRegistry();
  const categories = new CategoryRegistry();
  const formatters = new ToolResultFormatterRegistry();

  for (const formatter of createBuiltinFormatters()) {
    formatters.register(formatter);
  }

  const tools: ITool[] = [
    new GetCurrentTimeTool(),
    new SetLightTool(),
    new RememberFactTool(options.memory),
    new ForgetFactTool(options.memory),
    new UpdatePreferenceTool(options.memory),
    new NotePreferenceTool(options.memory),
    new SearchMemoryTool(options.memory),
    new SessionSummaryTool(options.memory),
    new ConversationSummaryTool(
      options.historyProvider ?? (() => []),
    ),
  ];

  if (options.search) {
    const maxResults = options.search.maxResults ?? 5;
    const searchWeb = new SearchWebTool(options.search.orchestrator, maxResults);
    tools.push(
      searchWeb,
      new WebSearchAliasTool(searchWeb),
      new SearchWikipediaTool(options.search.orchestrator, maxResults),
      new FetchPageTool(options.search.fetch),
      ...createSpecializedSearchTools(options.search.orchestrator, maxResults, {
        enableStubs: true,
      }),
    );
  }

  if (options.includePlannedStubs !== false) {
    tools.push(...createPlannedStubTools());
  }

  for (const tool of tools) {
    registry.register(tool);
  }

  const catalog = new ToolCatalog(registry);
  return { registry, catalog, categories, formatters };
}

import type {
  ISearchOrchestrator,
  IWebPageFetcher,
  SearchDomain,
  SearchIntent,
  ToolExecutionContext,
} from "@aria/contracts";
import { BaseTool, throwToolError } from "@aria/tool-runtime";
import { defineToolMeta } from "../../define-tool-meta.js";

function readQuery(args: Record<string, unknown>): string {
  return String(args["query"] ?? "").trim();
}

function readMaxResults(args: Record<string, unknown>, fallback: number): number {
  if (typeof args["max_results"] === "number" && Number.isFinite(args["max_results"])) {
    return Math.min(10, Math.max(1, Math.trunc(args["max_results"])));
  }
  return fallback;
}

export class SearchWebTool extends BaseTool {
  constructor(
    private readonly orchestrator: ISearchOrchestrator,
    private readonly maxResults: number,
  ) {
    super(
      defineToolMeta({
        id: "search.web",
        name: "search_web",
        category: "Search",
        tags: ["web", "search","analyze data"],
        permissions: ["search.web","analyze data"],
        estimatedLatencyMs: 800,
        timeoutMs: 20_000,
        description:
          "Search the public internet for current facts, news, or references.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query in the user's language",
            },
            max_results: {
              type: "number",
              description: "Optional max hits (1-10)",
            },
          },
          required: ["query"],
        },
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const query = readQuery(args);
    if (!query) {
      throwToolError("VALIDATION", "search_web requires a non-empty query");
    }
    const response = await this.orchestrator.search(
      {
        text: query,
        domain: "web",
        intent: "default",
        maxResults: readMaxResults(args, this.maxResults),
      },
      { signal: context.signal },
    );
    return {
      query: response.query,
      provider: response.provider,
      count: response.hits.length,
      hits: response.hits,
    };
  }
}

/** Temporary alias for search_web during migration. */
export class WebSearchAliasTool extends BaseTool {
  constructor(private readonly inner: SearchWebTool) {
    super(
      defineToolMeta({
        id: "search.web.alias",
        name: "web_search",
        category: "Search",
        tags: ["web", "deprecated"],
        permissions: ["search.web"],
        estimatedLatencyMs: 800,
        timeoutMs: 20_000,
        description:
          "Alias of search_web (prefer search_web for new calls).",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            max_results: { type: "number" },
          },
          required: ["query"],
        },
      }),
    );
  }

  execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    return this.inner.execute(args, context);
  }
}

export class FetchPageTool extends BaseTool {
  constructor(private readonly fetcher: IWebPageFetcher) {
    super(
      defineToolMeta({
        id: "search.fetch_page",
        name: "fetch_page",
        category: "Search",
        tags: ["web", "fetch"],
        permissions: ["search.fetch"],
        estimatedLatencyMs: 1200,
        timeoutMs: 20_000,
        description:
          "Fetch a public https URL and return cleaned page text. Use after search when a specific result needs more detail, or when the user provides a link. Does not execute JavaScript.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Public http(s) URL to fetch",
            },
          },
          required: ["url"],
        },
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const url = String(args["url"] ?? "").trim();
    if (!url) {
      throwToolError("VALIDATION", "fetch_page requires a non-empty url");
    }
    const page = await this.fetcher.fetch(url, { signal: context.signal });
    return {
      url: page.url,
      title: page.title,
      text: page.text,
      truncated: page.truncated,
      charCount: page.text.length,
    };
  }
}

export class SearchWikipediaTool extends BaseTool {
  constructor(
    private readonly orchestrator: ISearchOrchestrator,
    private readonly maxResults: number,
  ) {
    super(
      defineToolMeta({
        id: "search.wikipedia",
        name: "search_wikipedia",
        category: "Search",
        tags: ["wikipedia", "knowledge"],
        permissions: ["search.wikipedia"],
        estimatedLatencyMs: 600,
        timeoutMs: 15_000,
        description: "Search Wikipedia for encyclopedic knowledge.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Wikipedia search query" },
            max_results: { type: "number" },
          },
          required: ["query"],
        },
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const query = readQuery(args);
    if (!query) {
      throwToolError("VALIDATION", "search_wikipedia requires a non-empty query");
    }
    const response = await this.orchestrator.search(
      {
        text: query,
        domain: "wikipedia",
        intent: "general_knowledge",
        maxResults: readMaxResults(args, this.maxResults),
      },
      { signal: context.signal },
    );
    return {
      query: response.query,
      provider: response.provider,
      count: response.hits.length,
      hits: response.hits,
    };
  }
}

function specializedSearchTool(
  name: string,
  id: string,
  domain: SearchDomain,
  intent: SearchIntent,
  description: string,
  orchestrator: ISearchOrchestrator,
  maxResults: number,
  enabled: boolean,
): BaseTool {
  return new (class extends BaseTool {
    constructor() {
      super(
        defineToolMeta({
          id,
          name,
          category: "Search",
          tags: [domain],
          permissions: ["search.web"],
          enabled,
          status: enabled ? "active" : "planned",
          estimatedLatencyMs: 800,
          timeoutMs: 20_000,
          description,
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              max_results: { type: "number" },
            },
            required: ["query"],
          },
        }),
      );
    }

    async execute(
      args: Record<string, unknown>,
      context: ToolExecutionContext,
    ): Promise<unknown> {
      const query = readQuery(args);
      if (!query) {
        throwToolError("VALIDATION", `${name} requires a non-empty query`);
      }
      const response = await orchestrator.search(
        {
          text: query,
          domain,
          intent,
          maxResults: readMaxResults(args, maxResults),
        },
        { signal: context.signal },
      );
      return {
        query: response.query,
        provider: response.provider,
        domain,
        count: response.hits.length,
        hits: response.hits,
      };
    }
  })();
}

export function createSpecializedSearchTools(
  orchestrator: ISearchOrchestrator,
  maxResults: number,
  options: { readonly enableStubs?: boolean } = {},
): BaseTool[] {
  const enableStubs = options.enableStubs ?? true;
  return [
    specializedSearchTool(
      "search_documentation",
      "search.documentation",
      "documentation",
      "react",
      "Search technical documentation.",
      orchestrator,
      maxResults,
      enableStubs,
    ),
    specializedSearchTool(
      "search_github",
      "search.github",
      "github",
      "coding",
      "Search GitHub repositories and code.",
      orchestrator,
      maxResults,
      enableStubs,
    ),
    specializedSearchTool(
      "search_stackoverflow",
      "search.stackoverflow",
      "stackoverflow",
      "coding",
      "Search Stack Overflow Q&A.",
      orchestrator,
      maxResults,
      enableStubs,
    ),
    specializedSearchTool(
      "search_news",
      "search.news",
      "news",
      "news",
      "Search recent news articles.",
      orchestrator,
      maxResults,
      enableStubs,
    ),
    specializedSearchTool(
      "search_images",
      "search.images",
      "images",
      "default",
      "Search for images (provider-dependent).",
      orchestrator,
      maxResults,
      false,
    ),
    specializedSearchTool(
      "search_local_memory",
      "search.local_memory",
      "local_memory",
      "robot",
      "Search local Aria knowledge / memory index.",
      orchestrator,
      maxResults,
      enableStubs,
    ),
    specializedSearchTool(
      "search_project",
      "search.project",
      "project",
      "coding",
      "Search the current project codebase index.",
      orchestrator,
      maxResults,
      false,
    ),
    specializedSearchTool(
      "search_repository",
      "search.repository",
      "repository",
      "coding",
      "Search a configured source repository.",
      orchestrator,
      maxResults,
      false,
    ),
  ];
}

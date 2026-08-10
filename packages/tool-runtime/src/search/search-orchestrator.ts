import type {
  ISearchOrchestrator,
  ISearchProvider,
  SearchDomain,
  SearchIntent,
  SearchQuery,
  SearchResponse,
} from "@aria/contracts";
import { createToolError } from "@aria/contracts";
import { ToolExecutionError } from "../errors/to-tool-error.js";

/** Pure routing table — no LLM / tool coupling. */
export function providerOrderForIntent(
  intent: SearchIntent | undefined,
): readonly SearchDomain[] {
  switch (intent) {
    case "react":
      return ["documentation", "github", "stackoverflow", "web"];
    case "general_knowledge":
      return ["wikipedia", "web"];
    case "coding":
      return ["github", "documentation", "stackoverflow", "web"];
    case "robot":
      return ["local_memory", "documentation", "web"];
    case "news":
      return ["news", "web"];
    case "default":
    case undefined:
      return ["web"];
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}

export class SearchProviderRegistry {
  private readonly providers = new Map<string, ISearchProvider>();

  register(provider: ISearchProvider): this {
    if (this.providers.has(provider.metadata.id)) {
      throw new Error(`Search provider already registered: ${provider.metadata.id}`);
    }
    this.providers.set(provider.metadata.id, provider);
    return this;
  }

  list(): readonly ISearchProvider[] {
    return [...this.providers.values()];
  }

  forDomain(domain: SearchDomain): ISearchProvider[] {
    return this.list().filter((p) => p.domains.includes(domain));
  }
}

export class SearchOrchestrator implements ISearchOrchestrator {
  constructor(private readonly registry: SearchProviderRegistry) {}

  async search(
    query: SearchQuery,
    options?: { readonly signal?: AbortSignal },
  ): Promise<SearchResponse> {
    const trimmed = query.text.trim();
    if (!trimmed) {
      throw new ToolExecutionError(
        createToolError("VALIDATION", "Search query must be non-empty"),
      );
    }

    const domains: SearchDomain[] = query.domain
      ? [query.domain]
      : [...providerOrderForIntent(query.intent)];

    const allHits: SearchResponse["hits"] = [];
    let lastProvider = "none";
    const seen = new Set<string>();

    for (const domain of domains) {
      const providers = this.registry.forDomain(domain);
      for (const provider of providers) {
        options?.signal?.throwIfAborted();
        try {
          const response = await provider.search(
            {
              text: trimmed,
              domain,
              intent: query.intent,
              maxResults: query.maxResults,
            },
            options,
          );
          lastProvider = response.provider;
          for (const hit of response.hits) {
            if (seen.has(hit.url)) continue;
            seen.add(hit.url);
            allHits.push(hit);
          }
          if (allHits.length > 0) {
            const max = query.maxResults ?? 5;
            return {
              query: trimmed,
              hits: allHits.slice(0, max),
              provider: lastProvider,
              domain,
            };
          }
        } catch {
          // try next provider
        }
      }
    }

    return {
      query: trimmed,
      hits: [],
      provider: lastProvider,
      domain: domains[0],
    };
  }
}

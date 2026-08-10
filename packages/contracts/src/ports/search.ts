import type { PluginMetadata } from "../plugin-metadata.js";
import type {
  SearchDomain,
  SearchQuery,
  SearchResponse,
  WebPageContent,
  WebSearchResponse,
} from "../schemas.js";

/**
 * Port: Domain-aware search backend (web, wiki, docs, …).
 * Implementations: DuckDuckGo, Wikipedia, SearXNG, mock, stubs.
 */
export interface ISearchProvider {
  readonly metadata: PluginMetadata;
  readonly domains: readonly SearchDomain[];
  search(
    query: SearchQuery,
    options?: { readonly signal?: AbortSignal },
  ): Promise<SearchResponse>;
}

export interface ISearchOrchestrator {
  search(
    query: SearchQuery,
    options?: { readonly signal?: AbortSignal },
  ): Promise<SearchResponse>;
}

/**
 * @deprecated Prefer ISearchProvider with domains: ["web"].
 * Kept for ADR-0009 adapters during migration.
 */
export interface IWebSearchProvider {
  readonly metadata: PluginMetadata;
  search(
    query: string,
    options?: { readonly maxResults?: number; readonly signal?: AbortSignal },
  ): Promise<WebSearchResponse>;
}

/**
 * Port: Fetch a public URL and return cleaned text for the fetch_page tool.
 * Must reject private/loopback targets (SSRF).
 */
export interface IWebPageFetcher {
  readonly metadata: PluginMetadata;
  fetch(
    url: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<WebPageContent>;
}

/** Adapts legacy IWebSearchProvider to ISearchProvider. */
export function asSearchProvider(
  legacy: IWebSearchProvider,
): ISearchProvider {
  return {
    metadata: legacy.metadata,
    domains: ["web"],
    async search(query, options) {
      const response = await legacy.search(query.text, {
        maxResults: query.maxResults,
        signal: options?.signal,
      });
      return {
        query: response.query,
        hits: response.hits,
        provider: response.provider,
        domain: "web",
      };
    },
  };
}

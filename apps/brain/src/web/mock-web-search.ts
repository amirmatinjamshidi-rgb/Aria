import type {
  IWebSearchProvider,
  PluginMetadata,
  WebSearchResponse,
} from "@aria/contracts";

/**
 * Offline search stub for tests and demos when ARIA_WEB_SEARCH_PROVIDER=mock.
 */
export class MockWebSearchProvider implements IWebSearchProvider {
  readonly metadata: PluginMetadata = {
    id: "mock-web-search",
    name: "Mock Web Search",
    version: "0.1.0",
    description: "Deterministic offline web search hits",
  };

  async search(
    query: string,
    options?: { readonly maxResults?: number; readonly signal?: AbortSignal },
  ): Promise<WebSearchResponse> {
    options?.signal?.throwIfAborted();
    const max = options?.maxResults ?? 5;
    const hits = [
      {
        title: `Overview: ${query}`,
        url: "https://example.com/overview",
        snippet: `Mock summary about "${query}" for offline demos.`,
      },
      {
        title: `${query} — reference`,
        url: "https://example.com/reference",
        snippet: `Additional mock reference material related to ${query}.`,
      },
      {
        title: `News: ${query}`,
        url: "https://example.com/news",
        snippet: `Simulated recent mentions of ${query}.`,
      },
    ].slice(0, max);

    return { query, hits, provider: this.metadata.id };
  }
}

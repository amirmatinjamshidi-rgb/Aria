import type {
  ISearchProvider,
  PluginMetadata,
  SearchDomain,
  SearchQuery,
  SearchResponse,
} from "@aria/contracts";

export interface WikipediaSearchOptions {
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly language?: string;
}

/**
 * Wikipedia OpenSearch + page summary via MediaWiki API.
 */
export class WikipediaSearchProvider implements ISearchProvider {
  readonly metadata: PluginMetadata = {
    id: "wikipedia",
    name: "Wikipedia",
    version: "1.0.0",
    description: "MediaWiki OpenSearch provider",
  };

  readonly domains: readonly SearchDomain[] = ["wikipedia"];

  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly language: string;

  constructor(options: WikipediaSearchOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.language = options.language ?? "en";
  }

  async search(
    query: SearchQuery,
    options?: { readonly signal?: AbortSignal },
  ): Promise<SearchResponse> {
    const trimmed = query.text.trim();
    if (!trimmed) {
      return { query: "", hits: [], provider: this.metadata.id, domain: "wikipedia" };
    }

    const max = query.maxResults ?? 5;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const endpoint = new URL(
        `https://${this.language}.wikipedia.org/w/api.php`,
      );
      endpoint.searchParams.set("action", "opensearch");
      endpoint.searchParams.set("search", trimmed);
      endpoint.searchParams.set("limit", String(max));
      endpoint.searchParams.set("namespace", "0");
      endpoint.searchParams.set("format", "json");
      endpoint.searchParams.set("origin", "*");

      const response = await this.fetchImpl(endpoint.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Wikipedia HTTP ${response.status}`);
      }

      const data = (await response.json()) as [
        string,
        string[],
        string[],
        string[],
      ];
      const titles = data[1] ?? [];
      const descriptions = data[2] ?? [];
      const urls = data[3] ?? [];

      const hits = titles.map((title, index) => ({
        title,
        url: urls[index] ?? `https://${this.language}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        snippet: descriptions[index] ?? "",
      }));

      return {
        query: trimmed,
        hits,
        provider: this.metadata.id,
        domain: "wikipedia",
      };
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
    }
  }
}

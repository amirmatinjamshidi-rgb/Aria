import type {
  ISearchProvider,
  IWebPageFetcher,
  IWebSearchProvider,
  SearchDomain,
  SearchQuery,
  SearchResponse,
} from "@aria/contracts";
import { asSearchProvider } from "@aria/contracts";
import type { AriaConfig } from "@aria/core";
import {
  SearchOrchestrator,
  SearchProviderRegistry,
} from "@aria/tool-runtime";
import { DuckDuckGoWebSearchProvider } from "./duckduckgo-web-search.js";
import { HttpWebPageFetcher } from "./http-web-page-fetcher.js";
import { MockWebPageFetcher } from "./mock-web-page-fetcher.js";
import { MockWebSearchProvider } from "./mock-web-search.js";
import { StubSearchProvider } from "./stub-search-provider.js";
import { WikipediaSearchProvider } from "./wikipedia-search.js";

export interface WebToolBackends {
  readonly search: IWebSearchProvider;
  readonly fetch: IWebPageFetcher;
  readonly orchestrator: SearchOrchestrator;
  readonly providers: SearchProviderRegistry;
}

function mockAsSearchProvider(legacy: IWebSearchProvider): ISearchProvider {
  return asSearchProvider(legacy);
}

class DuckDuckGoSearchProviderAdapter implements ISearchProvider {
  readonly metadata;
  readonly domains: readonly SearchDomain[] = ["web"];
  private readonly inner: DuckDuckGoWebSearchProvider;

  constructor(timeoutMs: number) {
    this.inner = new DuckDuckGoWebSearchProvider({ timeoutMs });
    this.metadata = this.inner.metadata;
  }

  async search(
    query: SearchQuery,
    options?: { readonly signal?: AbortSignal },
  ): Promise<SearchResponse> {
    const response = await this.inner.search(query.text, {
      maxResults: query.maxResults,
      signal: options?.signal,
    });
    return {
      query: response.query,
      hits: response.hits,
      provider: response.provider,
      domain: "web",
    };
  }
}

/** Compose web/search backends from config. Only call when web.enabled. */
export function createWebToolBackends(config: AriaConfig): WebToolBackends {
  const { searchProvider, timeoutMs, maxPageChars, searchProviders } = config.web;
  const providers = new SearchProviderRegistry();

  const requested =
    searchProviders.length > 0
      ? searchProviders
      : searchProvider === "mock"
        ? ["mock", "wikipedia"]
        : ["duckduckgo", "wikipedia"];

  let legacySearch: IWebSearchProvider;
  let fetch: IWebPageFetcher;

  if (searchProvider === "mock" || requested.includes("mock")) {
    legacySearch = new MockWebSearchProvider();
    fetch = new MockWebPageFetcher();
  } else {
    legacySearch = new DuckDuckGoWebSearchProvider({ timeoutMs });
    fetch = new HttpWebPageFetcher({ timeoutMs, maxPageChars });
  }

  for (const id of requested) {
    switch (id) {
      case "mock":
        providers.register(mockAsSearchProvider(new MockWebSearchProvider()));
        break;
      case "duckduckgo":
        providers.register(new DuckDuckGoSearchProviderAdapter(timeoutMs));
        break;
      case "wikipedia":
        providers.register(new WikipediaSearchProvider({ timeoutMs }));
        break;
      case "searxng":
        providers.register(new StubSearchProvider("searxng", ["web"]));
        break;
      case "brave":
        providers.register(new StubSearchProvider("brave", ["web", "news"]));
        break;
      case "bing":
        providers.register(new StubSearchProvider("bing", ["web"]));
        break;
      case "github":
        providers.register(new StubSearchProvider("github", ["github", "repository"]));
        break;
      case "documentation":
        providers.register(
          new StubSearchProvider("documentation", ["documentation"]),
        );
        break;
      case "local_knowledge":
        providers.register(
          new StubSearchProvider("local_knowledge", ["local_memory"]),
        );
        break;
      default:
        providers.register(new StubSearchProvider(id, ["web"]));
        break;
    }
  }

  // Ensure stubs exist for specialized domains even if not listed
  const ensureStub = (id: string, domains: SearchDomain[]) => {
    if (!providers.list().some((p) => p.metadata.id === id)) {
      providers.register(new StubSearchProvider(id, domains));
    }
  };
  ensureStub("github", ["github", "repository"]);
  ensureStub("documentation", ["documentation"]);
  ensureStub("stackoverflow", ["stackoverflow"]);
  ensureStub("news", ["news"]);
  ensureStub("local_knowledge", ["local_memory"]);

  if (
    !providers.list().some((p) => p.domains.includes("web")) &&
    searchProvider === "duckduckgo"
  ) {
    providers.register(new DuckDuckGoSearchProviderAdapter(timeoutMs));
  }

  const orchestrator = new SearchOrchestrator(providers);

  return {
    search: legacySearch,
    fetch,
    orchestrator,
    providers,
  };
}

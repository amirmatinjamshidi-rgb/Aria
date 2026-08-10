import type {
  IWebSearchProvider,
  PluginMetadata,
  WebSearchHit,
  WebSearchResponse,
} from "@aria/contracts";

export interface DuckDuckGoWebSearchOptions {
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

/**
 * DuckDuckGo Instant Answer API — no API key required.
 * Good enough for first online slice; swap via IWebSearchProvider later.
 */
export class DuckDuckGoWebSearchProvider implements IWebSearchProvider {
  readonly metadata: PluginMetadata = {
    id: "duckduckgo",
    name: "DuckDuckGo Instant Answer",
    version: "1.0.0",
    description: "Keyless DuckDuckGo Instant Answer search",
  };

  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DuckDuckGoWebSearchOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(
    query: string,
    options?: { readonly maxResults?: number; readonly signal?: AbortSignal },
  ): Promise<WebSearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new Error("web_search requires a non-empty query");
    }

    const max = options?.maxResults ?? 5;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const endpoint = new URL("https://api.duckduckgo.com/");
      endpoint.searchParams.set("q", trimmed);
      endpoint.searchParams.set("format", "json");
      endpoint.searchParams.set("no_redirect", "1");
      endpoint.searchParams.set("no_html", "1");
      endpoint.searchParams.set("skip_disambig", "1");

      const response = await this.fetchImpl(endpoint.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`DuckDuckGo HTTP ${response.status}`);
      }

      const data = (await response.json()) as DuckDuckGoResponse;
      const hits = collectHits(data, trimmed).slice(0, max);
      return { query: trimmed, hits, provider: this.metadata.id };
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
    }
  }
}

interface DuckDuckGoResponse {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  Answer?: string;
  AnswerType?: string;
  RelatedTopics?: Array<
    DuckDuckGoTopic | { Name?: string; Topics?: DuckDuckGoTopic[] }
  >;
  Results?: DuckDuckGoTopic[];
}

interface DuckDuckGoTopic {
  Text?: string;
  FirstURL?: string;
  Result?: string;
}

function collectHits(data: DuckDuckGoResponse, query: string): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();

  const push = (title: string, url: string, snippet: string) => {
    if (!url || seen.has(url)) return;
    try {
      new URL(url);
    } catch {
      return;
    }
    seen.add(url);
    hits.push({
      title: title || url,
      url,
      snippet: snippet.slice(0, 400),
    });
  };

  if (data.AbstractURL && (data.AbstractText || data.Heading)) {
    push(data.Heading || query, data.AbstractURL, data.AbstractText ?? "");
  }

  if (data.Answer && data.AbstractURL) {
    push(data.Heading || query, data.AbstractURL, String(data.Answer));
  }

  for (const item of data.Results ?? []) {
    if (item.FirstURL) {
      push(topicTitle(item), item.FirstURL, item.Text ?? "");
    }
  }

  for (const item of data.RelatedTopics ?? []) {
    if ("FirstURL" in item && item.FirstURL) {
      push(topicTitle(item), item.FirstURL, item.Text ?? "");
      continue;
    }
    if ("Topics" in item && Array.isArray(item.Topics)) {
      for (const nested of item.Topics) {
        if (nested.FirstURL) {
          push(topicTitle(nested), nested.FirstURL, nested.Text ?? "");
        }
      }
    }
  }

  return hits;
}

function topicTitle(topic: DuckDuckGoTopic): string {
  if (topic.Text) {
    const beforeDash = topic.Text.split(" - ")[0]?.trim();
    if (beforeDash) return beforeDash.slice(0, 120);
  }
  return topic.FirstURL ?? "Result";
}

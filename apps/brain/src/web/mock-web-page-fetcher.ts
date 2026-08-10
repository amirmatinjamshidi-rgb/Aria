import type {
  IWebPageFetcher,
  PluginMetadata,
  WebPageContent,
} from "@aria/contracts";
import { assertSafePublicHttpUrl } from "./url-safety.js";

/**
 * Offline page fetch stub used with the mock search provider.
 */
export class MockWebPageFetcher implements IWebPageFetcher {
  readonly metadata: PluginMetadata = {
    id: "mock-web-fetch",
    name: "Mock Web Page Fetcher",
    version: "0.1.0",
    description: "Deterministic offline page text",
  };

  async fetch(
    url: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<WebPageContent> {
    options?.signal?.throwIfAborted();
    const safe = assertSafePublicHttpUrl(url);
    return {
      url: safe.toString(),
      title: "Mock page",
      text: `This is mock page content for ${safe.toString()}. Use ARIA_WEB_SEARCH_PROVIDER=duckduckgo for live fetches.`,
      truncated: false,
    };
  }
}

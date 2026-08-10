import type {
  IWebPageFetcher,
  PluginMetadata,
  WebPageContent,
} from "@aria/contracts";
import { htmlToText } from "./html-to-text.js";
import { assertSafePublicHttpUrl } from "./url-safety.js";

export interface HttpWebPageFetcherOptions {
  readonly timeoutMs?: number;
  readonly maxPageChars?: number;
  readonly maxBytes?: number;
  readonly fetchImpl?: typeof fetch;
  readonly userAgent?: string;
}

/**
 * Fetches a public http(s) page and returns cleaned text.
 */
export class HttpWebPageFetcher implements IWebPageFetcher {
  readonly metadata: PluginMetadata = {
    id: "http-web-fetch",
    name: "HTTP Web Page Fetcher",
    version: "0.1.0",
    description: "SSRF-safe public page fetch + HTML text extraction",
  };

  private readonly timeoutMs: number;
  private readonly maxPageChars: number;
  private readonly maxBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: HttpWebPageFetcherOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxPageChars = options.maxPageChars ?? 8_000;
    this.maxBytes = options.maxBytes ?? 1_000_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent =
      options.userAgent ?? "AriaHomeAssistant/0.1 (+local; fetch_page tool)";
  }

  async fetch(
    url: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<WebPageContent> {
    const safe = assertSafePublicHttpUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await this.fetchImpl(safe.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
          "User-Agent": this.userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${safe.toString()}`);
      }

      // Re-check final URL after redirects
      assertSafePublicHttpUrl(response.url || safe.toString());

      const contentType = response.headers.get("content-type") ?? "";
      const raw = await readLimitedText(response, this.maxBytes);

      if (
        contentType.includes("text/plain") ||
        contentType.includes("application/json")
      ) {
        const truncated = raw.length > this.maxPageChars;
        return {
          url: response.url || safe.toString(),
          title: "",
          text: truncated ? raw.slice(0, this.maxPageChars) : raw,
          truncated,
        };
      }

      const { title, text } = htmlToText(raw);
      const truncated = text.length > this.maxPageChars;
      return {
        url: response.url || safe.toString(),
        title,
        text: truncated ? text.slice(0, this.maxPageChars) : text,
        truncated,
      };
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
    }
  }
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > maxBytes) {
    throw new Error(`Page exceeds size limit (${maxBytes} bytes)`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Page exceeds size limit (${maxBytes} bytes)`);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

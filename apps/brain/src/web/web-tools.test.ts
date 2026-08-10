import { describe, expect, it } from "vitest";
import { loadConfig } from "@aria/core";
import {
  defaultGrantedPermissions,
  ToolExecutor,
} from "@aria/tool-runtime";
import { createDefaultToolRegistry } from "../tools/create-default-tools.js";
import { ToolResultSynthesizer } from "../tools/tool-result-synthesizer.js";
import { ConversationPlanner } from "../planning/conversation-planner.js";
import { MockWebPageFetcher } from "./mock-web-page-fetcher.js";
import { MockWebSearchProvider } from "./mock-web-search.js";
import { assertSafePublicHttpUrl } from "./url-safety.js";
import { htmlToText } from "./html-to-text.js";

const perms = new Set(defaultGrantedPermissions({ webEnabled: true }));

describe("web tools", () => {
  it("registers search_web, web_search alias, and fetch_page when backends are provided", () => {
    const registry = createDefaultToolRegistry({
      web: {
        search: new MockWebSearchProvider(),
        fetch: new MockWebPageFetcher(),
      },
    });
    const names = registry.listDefinitions().map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_current_time",
        "note_preference",
        "set_light",
        "search_web",
        "web_search",
        "fetch_page",
        "search_wikipedia",
      ]),
    );
  });

  it("does not register web tools by default", () => {
    const names = createDefaultToolRegistry()
      .listDefinitions()
      .map((d) => d.name);
    expect(names).not.toContain("web_search");
    expect(names).not.toContain("search_web");
    expect(names).not.toContain("fetch_page");
  });

  it("executes mock web_search and synthesizes bilingual narrative", async () => {
    const registry = createDefaultToolRegistry({
      web: {
        search: new MockWebSearchProvider(),
        fetch: new MockWebPageFetcher(),
        maxResults: 2,
      },
    });
    const result = await registry.execute(
      {
        id: "t1",
        name: "web_search",
        arguments: { query: "Aria assistant" },
      },
      { correlationId: "c1", grantedPermissions: perms },
    );
    expect(result.ok).toBe(true);
    const data = result.result as { count: number; hits: unknown[] };
    expect(data.count).toBe(2);

    const synth = new ToolResultSynthesizer();
    const en = synth.synthesize(result, "en");
    expect(en).toMatch(/Web results/i);
    expect(synth.looksLikeRawToolDump(en)).toBe(false);
  });

  it("executes mock fetch_page", async () => {
    const registry = createDefaultToolRegistry({
      web: {
        search: new MockWebSearchProvider(),
        fetch: new MockWebPageFetcher(),
      },
    });
    const result = await registry.execute(
      {
        id: "t2",
        name: "fetch_page",
        arguments: { url: "https://example.com/docs" },
      },
      { correlationId: "c1", grantedPermissions: perms },
    );
    expect(result.ok).toBe(true);
    const synth = new ToolResultSynthesizer();
    expect(synth.synthesize(result, "en")).toMatch(/Content from/i);
  });

  it("blocks SSRF targets", () => {
    expect(() => assertSafePublicHttpUrl("http://127.0.0.1/admin")).toThrow(
      /private|local/i,
    );
    expect(() => assertSafePublicHttpUrl("http://192.168.1.1/")).toThrow();
    expect(() => assertSafePublicHttpUrl("file:///etc/passwd")).toThrow();
    expect(assertSafePublicHttpUrl("https://example.com/a").hostname).toBe(
      "example.com",
    );
  });

  it("extracts text from HTML", () => {
    const { title, text } = htmlToText(
      "<html><head><title>Hello</title></head><body><p>World &amp; friends</p><script>bad()</script></body></html>",
    );
    expect(title).toBe("Hello");
    expect(text).toMatch(/World & friends/);
    expect(text).not.toMatch(/bad/);
  });

  it("planner allows tools when catalog is non-empty without hardcoding names", () => {
    const planner = new ConversationPlanner();
    const registry = createDefaultToolRegistry({
      web: {
        search: new MockWebSearchProvider(),
        fetch: new MockWebPageFetcher(),
      },
    });
    const plan = planner.assess({
      text: "search the web for latest news about Mars",
      language: "en",
      availableTools: registry.listDefinitions(),
    });
    expect(plan.allowTools).toBe(true);
    expect(plan.rejected).toBe(false);
    expect(plan.steps.some((s) => s.kind === "tool")).toBe(true);
  });

  it("executor validates unknown tools with structured errors", async () => {
    const registry = createDefaultToolRegistry();
    const executor = new ToolExecutor({ registry });
    const result = await executor.execute(
      { id: "x", name: "nope", arguments: {} },
      { correlationId: "c1", grantedPermissions: perms },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toEqual(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });
});

describe("web config", () => {
  it("defaults web tools to disabled", () => {
    const config = loadConfig({});
    expect(config.web.enabled).toBe(false);
    expect(config.web.searchProvider).toBe("mock");
  });

  it("loads web env overrides", () => {
    const config = loadConfig({
      ARIA_WEB_ENABLED: "true",
      ARIA_WEB_SEARCH_PROVIDER: "duckduckgo",
      ARIA_WEB_MAX_RESULTS: "3",
    });
    expect(config.web.enabled).toBe(true);
    expect(config.web.searchProvider).toBe("duckduckgo");
    expect(config.web.maxResults).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import {
  createToolError,
  type ToolExecutionContext,
} from "@aria/contracts";
import { FakeSearchProvider, FakeTool } from "./testing/fakes.js";
import { ToolRegistry } from "./registry/tool-registry.js";
import { ToolCatalog } from "./registry/tool-catalog.js";
import { ToolExecutor } from "./execution/tool-executor.js";
import { PermissionGate } from "./permissions/permission-gate.js";
import {
  SearchOrchestrator,
  SearchProviderRegistry,
  providerOrderForIntent,
} from "./search/search-orchestrator.js";

const ctx = (perms: string[] = []): ToolExecutionContext => ({
  correlationId: "c1",
  grantedPermissions: new Set(perms),
});

describe("@aria/tool-runtime", () => {
  it("registers tools and builds a catalog snapshot once", () => {
    const registry = new ToolRegistry();
    registry.register(
      new FakeTool({
        id: "time.current",
        name: "get_current_time",
        version: "1.0.0",
        description: "time",
        category: "Time",
        tags: ["clock"],
        safety: "SAFE",
        permissions: [],
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: {} },
        timeoutMs: 1000,
        estimatedLatencyMs: 10,
        examples: [],
        enabled: true,
        status: "active",
        concurrent: true,
      }),
    );
    const catalog = new ToolCatalog(registry);
    expect(catalog.version).toBe(1);
    expect(catalog.definitionsForLlm()).toHaveLength(1);
    expect(catalog.toPromptGuidance()).toContain("get_current_time");
  });

  it("executor enforces permissions and returns structured errors", async () => {
    const registry = new ToolRegistry();
    registry.register(
      new FakeTool({
        id: "search.web",
        name: "search_web",
        version: "1.0.0",
        description: "search",
        category: "Search",
        tags: [],
        safety: "SAFE",
        permissions: ["search.web"],
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        outputSchema: { type: "object", properties: {} },
        timeoutMs: 1000,
        estimatedLatencyMs: 50,
        examples: [],
        enabled: true,
        status: "active",
        concurrent: true,
      }),
    );
    const executor = new ToolExecutor({
      registry,
      permissionGate: new PermissionGate(),
    });

    const denied = await executor.execute(
      { id: "1", name: "search_web", arguments: { query: "hi" } },
      ctx([]),
    );
    expect(denied.ok).toBe(false);
    expect(denied.error).toEqual(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );

    const ok = await executor.execute(
      { id: "2", name: "search_web", arguments: { query: "hi" } },
      ctx(["search.web"]),
    );
    expect(ok.ok).toBe(true);
  });

  it("routes search intents and uses providers", async () => {
    expect(providerOrderForIntent("coding")[0]).toBe("github");
    const providers = new SearchProviderRegistry();
    providers.register(
      new FakeSearchProvider({ id: "wiki", domains: ["wikipedia"] }),
    );
    providers.register(
      new FakeSearchProvider({ id: "web", domains: ["web"] }),
    );
    const orch = new SearchOrchestrator(providers);
    const result = await orch.search({
      text: "aria",
      intent: "general_knowledge",
      maxResults: 3,
    });
    expect(result.provider).toBe("wiki");
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it("createToolError helper shape", () => {
    expect(createToolError("TIMEOUT", "slow", { retryable: true }).retryable).toBe(
      true,
    );
  });
});

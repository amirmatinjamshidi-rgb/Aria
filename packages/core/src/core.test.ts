import { describe, expect, it, vi } from "vitest";
import {
  AriaEventType,
  createUserUtterance,
} from "@aria/contracts";
import { Container, TOKENS } from "../src/di/container.js";
import { InProcessMessageBus } from "../src/bus/in-process-bus.js";
import { loadConfig } from "../src/config/load-config.js";
import { PluginRegistry } from "../src/plugins/registry.js";

describe("Container", () => {
  it("resolves singleton registrations", () => {
    const container = new Container();
    let creations = 0;
    container.register(TOKENS.Logger, () => {
      creations += 1;
      return { id: creations };
    });
    const a = container.resolve<{ id: number }>(TOKENS.Logger);
    const b = container.resolve<{ id: number }>(TOKENS.Logger);
    expect(a).toBe(b);
    expect(creations).toBe(1);
  });

  it("throws for missing tokens", () => {
    const container = new Container();
    expect(() => container.resolve(TOKENS.Config)).toThrow(/No registration/);
  });
});

describe("InProcessMessageBus", () => {
  it("delivers events to typed subscribers", async () => {
    const bus = new InProcessMessageBus();
    const handler = vi.fn();
    bus.subscribe(AriaEventType.ConversationUserUtterance, handler);
    const event = createUserUtterance("hi", "en", "c1");
    await bus.publish(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("supports wildcard subscribers and unsubscribe", async () => {
    const bus = new InProcessMessageBus();
    const handler = vi.fn();
    const unsub = bus.subscribe("*", handler);
    await bus.publish(createUserUtterance("a", "en", "1"));
    unsub();
    await bus.publish(createUserUtterance("b", "en", "2"));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("loadConfig", () => {
  it("applies defaults and env overrides", () => {
    const config = loadConfig({
      ARIA_ENV: "sim",
      ARIA_LLM_PROVIDER: "echo",
      ARIA_LOG_LEVEL: "debug",
    });
    expect(config.env).toBe("sim");
    expect(config.llmProvider).toBe("echo");
    expect(config.logLevel).toBe("debug");
    expect(config.bus).toBe("inprocess");
  });

  it("loads ollama and personality Phase 1 settings", () => {
    const config = loadConfig({
      ARIA_LLM_PROVIDER: "ollama",
      ARIA_OLLAMA_URL: "http://127.0.0.1:11434",
      ARIA_OLLAMA_MODEL: "qwen3.5:latest",
      ARIA_NAME: "Aria",
      ARIA_PERSONALITY_TONE: "calm",
      ARIA_PERSONALITY_TRAITS: "kind, bilingual",
      ARIA_TOOLS_ENABLED: "true",
      ARIA_TOOLS_MAX_ROUNDS: "2",
    });
    expect(config.llmProvider).toBe("ollama");
    expect(config.ollama.model).toBe("qwen3.5:latest");
    expect(config.personality.tone).toBe("calm");
    expect(config.personality.traits).toEqual(["kind", "bilingual"]);
    expect(config.tools.maxRounds).toBe(2);
  });

  it("loads openrouter settings with default Nemotron free model", () => {
    const config = loadConfig({
      ARIA_LLM_PROVIDER: "openrouter",
      ARIA_OPENROUTER_API_KEY: "sk-or-test",
      ARIA_OPENROUTER_APP_TITLE: "Aria Dev",
    });
    expect(config.llmProvider).toBe("openrouter");
    expect(config.openrouter.apiKey).toBe("sk-or-test");
    expect(config.openrouter.model).toBe(
      "nvidia/nemotron-3-ultra-550b-a55b:free",
    );
    expect(config.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.openrouter.appTitle).toBe("Aria Dev");
  });
});

describe("PluginRegistry", () => {
  it("creates registered plugins by id", async () => {
    const registry = new PluginRegistry<{ hello: string }>();
    registry.register(
      { id: "a", name: "A", version: "0.1.0" },
      () => ({ hello: "a" }),
    );
    registry.register(
      { id: "b", name: "B", version: "0.1.0" },
      () => ({ hello: "b" }),
    );
    const plugin = await registry.create("b");
    expect(plugin.hello).toBe("b");
    expect(registry.list()).toHaveLength(2);
  });

  it("rejects unknown plugin ids", async () => {
    const registry = new PluginRegistry();
    await expect(registry.create("missing")).rejects.toThrow(/Unknown plugin/);
  });
});

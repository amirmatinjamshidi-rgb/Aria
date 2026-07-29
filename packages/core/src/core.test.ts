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

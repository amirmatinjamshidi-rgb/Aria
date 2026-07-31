import { describe, expect, it } from "vitest";
import { TinyRegistry } from "../src/registry.js";

describe("Exercise 3: TinyRegistry", () => {
  it("creates registered plugins by id", async () => {
    const registry = new TinyRegistry<{ hello: string }>();
    registry.register({ id: "a", name: "A", version: "0.1.0" }, () => ({
      hello: "a",
    }));
    registry.register({ id: "b", name: "B", version: "0.1.0" }, () => ({
      hello: "b",
    }));
    const plugin = await registry.create("b");
    expect(plugin.hello).toBe("b");
  });

  it("supports async factories", async () => {
    const registry = new TinyRegistry<{ ready: boolean }>();
    registry.register({ id: "slow", name: "Slow", version: "0.1.0" }, () =>
      Promise.resolve({ ready: true }),
    );
    await expect(registry.create("slow")).resolves.toEqual({ ready: true });
  });

  it("lists metadata in registration order", () => {
    const registry = new TinyRegistry<object>();
    registry.register({ id: "x", name: "X", version: "1.0.0" }, () => ({}));
    registry.register({ id: "y", name: "Y", version: "2.0.0" }, () => ({}));
    expect(registry.list().map((m) => m.id)).toEqual(["x", "y"]);
    expect(registry.has("x")).toBe(true);
    expect(registry.has("z")).toBe(false);
  });

  it("rejects duplicate registrations", () => {
    const registry = new TinyRegistry<object>();
    registry.register({ id: "dup", name: "D", version: "0.1.0" }, () => ({}));
    expect(() =>
      registry.register({ id: "dup", name: "D2", version: "0.2.0" }, () => ({})),
    ).toThrow(/already registered/);
  });

  it("names the available plugins when the id is unknown", async () => {
    const registry = new TinyRegistry<object>();
    registry.register({ id: "a", name: "A", version: "0.1.0" }, () => ({}));
    registry.register({ id: "b", name: "B", version: "0.1.0" }, () => ({}));
    await expect(registry.create("nope")).rejects.toThrow(
      /Unknown plugin "nope"\. Available: a, b/,
    );
  });
});

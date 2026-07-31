import { describe, expect, it } from "vitest";
import { Container, TOKENS } from "../src/container.js";

describe("Exercise 1: Container", () => {
  it("resolves a registered factory", () => {
    const container = new Container();
    container.register(TOKENS.Logger, () => ({ name: "log" }));
    expect(container.resolve<{ name: string }>(TOKENS.Logger)).toEqual({
      name: "log",
    });
  });

  it("caches singletons — the factory runs exactly once", () => {
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

  it("re-runs transient factories on every resolve", () => {
    const container = new Container();
    let creations = 0;
    container.register(
      TOKENS.Logger,
      () => {
        creations += 1;
        return { id: creations };
      },
      { singleton: false },
    );
    const a = container.resolve<{ id: number }>(TOKENS.Logger);
    const b = container.resolve<{ id: number }>(TOKENS.Logger);
    expect(a).not.toBe(b);
    expect(creations).toBe(2);
  });

  it("factories can resolve their own dependencies from the container", () => {
    const container = new Container();
    container.registerInstance(TOKENS.Config, { greeting: "salam" });
    container.register(TOKENS.Greeter, (c) => {
      const config = c.resolve<{ greeting: string }>(TOKENS.Config);
      return { greet: (name: string) => `${config.greeting} ${name}` };
    });
    const greeter = container.resolve<{ greet(n: string): string }>(
      TOKENS.Greeter,
    );
    expect(greeter.greet("Aria")).toBe("salam Aria");
  });

  it("registerInstance stores a prebuilt value", () => {
    const container = new Container();
    const instance = { fixed: true };
    container.registerInstance(TOKENS.Config, instance);
    expect(container.resolve(TOKENS.Config)).toBe(instance);
  });

  it("throws a helpful error for unknown tokens", () => {
    const container = new Container();
    expect(() => container.resolve(TOKENS.Bus)).toThrow(/No registration/);
  });

  it("has() reports registration state", () => {
    const container = new Container();
    expect(container.has(TOKENS.Config)).toBe(false);
    container.registerInstance(TOKENS.Config, {});
    expect(container.has(TOKENS.Config)).toBe(true);
  });
});

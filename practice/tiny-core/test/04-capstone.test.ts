import { describe, expect, it } from "vitest";
import { createGreeterApp } from "../src/app.js";
import { TOKENS } from "../src/container.js";
import type { GreetingDeliveredEvent } from "../src/events.js";

/**
 * The kata's Phase-0-in-miniature acceptance test:
 * swapping GREETER_PROVIDER changes behavior with zero service changes.
 */
async function requestGreeting(
  env: Record<string, string | undefined>,
  name: string,
): Promise<GreetingDeliveredEvent> {
  const app = createGreeterApp(env);
  const delivered: GreetingDeliveredEvent[] = [];
  app.bus.subscribe<GreetingDeliveredEvent>("greeting.delivered", (event) => {
    delivered.push(event);
  });
  await app.bus.publish({
    type: "greeting.requested",
    name,
    correlationId: "corr-42",
  });
  expect(delivered).toHaveLength(1);
  return delivered[0]!;
}

describe("Exercise 4: composition root + provider swap", () => {
  it("defaults to the formal provider", async () => {
    const event = await requestGreeting({}, "Sam");
    expect(event.text).toBe("Good day, Sam.");
    expect(event.providerId).toBe("formal");
    expect(event.correlationId).toBe("corr-42");
  });

  it("swaps to the casual provider via env alone", async () => {
    const event = await requestGreeting({ GREETER_PROVIDER: "casual" }, "Sam");
    expect(event.text).toBe("hey Sam!");
    expect(event.providerId).toBe("casual");
  });

  it("rejects unknown providers with the available ids", () => {
    expect(() => createGreeterApp({ GREETER_PROVIDER: "gpt9" })).toThrow(
      /Unknown plugin "gpt9"/,
    );
  });

  it("exposes the bus and provider id through the container", () => {
    const app = createGreeterApp({ GREETER_PROVIDER: "casual" });
    expect(app.providerId).toBe("casual");
    expect(app.container.has(TOKENS.Bus)).toBe(true);
    expect(app.container.has(TOKENS.Greeter)).toBe(true);
    expect(app.container.resolve(TOKENS.Bus)).toBe(app.bus);
  });
});

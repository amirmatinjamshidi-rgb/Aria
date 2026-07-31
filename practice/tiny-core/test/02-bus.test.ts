import { describe, expect, it, vi } from "vitest";
import { TinyBus } from "../src/bus.js";
import type { GreetingRequestedEvent } from "../src/events.js";

function requested(name: string, correlationId = "c1"): GreetingRequestedEvent {
  return { type: "greeting.requested", name, correlationId };
}

describe("Exercise 2: TinyBus", () => {
  it("delivers events to subscribers of that type", async () => {
    const bus = new TinyBus();
    const handler = vi.fn();
    bus.subscribe("greeting.requested", handler);
    const event = requested("Sam");
    await bus.publish(event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not deliver events of other types", async () => {
    const bus = new TinyBus();
    const handler = vi.fn();
    bus.subscribe("greeting.delivered", handler);
    await bus.publish(requested("Sam"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("wildcard subscribers receive every event", async () => {
    const bus = new TinyBus();
    const handler = vi.fn();
    bus.subscribe("*", handler);
    await bus.publish(requested("a"));
    await bus.publish({
      type: "greeting.delivered",
      text: "hi a",
      providerId: "formal",
      correlationId: "c1",
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe removes exactly that handler", async () => {
    const bus = new TinyBus();
    const kept = vi.fn();
    const removed = vi.fn();
    bus.subscribe("greeting.requested", kept);
    const unsub = bus.subscribe("greeting.requested", removed);
    unsub();
    await bus.publish(requested("Sam"));
    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
  });

  it("awaits async handlers in subscription order", async () => {
    const bus = new TinyBus();
    const order: string[] = [];
    bus.subscribe("greeting.requested", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("slow-first");
    });
    bus.subscribe("greeting.requested", () => {
      order.push("fast-second");
    });
    await bus.publish(requested("Sam"));
    expect(order).toEqual(["slow-first", "fast-second"]);
  });

  it("a throwing handler does not starve later handlers; publish rejects after", async () => {
    const bus = new TinyBus();
    const after = vi.fn();
    bus.subscribe("greeting.requested", () => {
      throw new Error("boom");
    });
    bus.subscribe("greeting.requested", after);
    await expect(bus.publish(requested("Sam"))).rejects.toThrow("boom");
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("dispose drops all handlers", async () => {
    const bus = new TinyBus();
    const handler = vi.fn();
    bus.subscribe("*", handler);
    await bus.dispose();
    await bus.publish(requested("Sam"));
    expect(handler).not.toHaveBeenCalled();
  });
});

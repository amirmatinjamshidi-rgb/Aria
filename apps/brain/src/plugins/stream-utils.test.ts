import { describe, expect, it } from "vitest";
import { ThinkTagFilter, iterateTextDeltas } from "./stream-utils.js";

describe("ThinkTagFilter", () => {
  it("passes ordinary text through", () => {
    const filter = new ThinkTagFilter();
    expect(filter.push("Hello ")).toBe("Hello ");
    expect(filter.push("world.")).toBe("world.");
    expect(filter.flush()).toBe("");
  });

  it("strips a think block that arrives in one chunk", () => {
    const filter = new ThinkTagFilter();
    expect(filter.push("Hi <think>secret</think> there")).toBe("Hi  there");
  });

  it("strips a think block split across deltas", () => {
    const filter = new ThinkTagFilter();
    expect(filter.push("Hi <th")).toBe("Hi ");
    expect(filter.push("ink>nope</th")).toBe("");
    expect(filter.push("ink> there")).toBe(" there");
    expect(filter.flush()).toBe("");
  });

  it("drops an unterminated think block on flush", () => {
    const filter = new ThinkTagFilter();
    expect(filter.push("Hi <think>still thinking")).toBe("Hi ");
    expect(filter.flush()).toBe("");
  });
});

describe("iterateTextDeltas", () => {
  it("splits on word boundaries", () => {
    expect([...iterateTextDeltas("Hello there.")]).toEqual(["Hello ", "there."]);
  });
});

import { describe, expect, it } from "vitest";
import { createDefaultToolRegistry } from "../../create-default-tools.js";

describe("vision tools", () => {
  it("detect_objects and describe_scene work with mock provider", async () => {
    const registry = createDefaultToolRegistry({ includeVision: true });

    const detect = await registry.execute(
      { id: "1", name: "detect_objects", arguments: {} },
      { correlationId: "c1", language: "en" },
    );
    expect(detect.ok).toBe(true);
    const detectResult = detect.result as { count: number };
    expect(detectResult.count).toBeGreaterThan(0);

    const describe = await registry.execute(
      { id: "2", name: "describe_scene", arguments: {} },
      { correlationId: "c2", language: "en" },
    );
    expect(describe.ok).toBe(true);
    const describeResult = describe.result as { description: string };
    expect(describeResult.description.length).toBeGreaterThan(0);

    const find = await registry.execute(
      { id: "3", name: "find_object", arguments: { label: "cup" } },
      { correlationId: "c3", language: "en" },
    );
    expect(find.ok).toBe(true);
    const findResult = find.result as { found: boolean };
    expect(findResult.found).toBe(true);
  });
});

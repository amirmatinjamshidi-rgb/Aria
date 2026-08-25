import type { IVisionProvider, PermissionId } from "@aria/contracts";
import { InMemoryVisionSceneStore } from "@aria/core";
import { describe, expect, it } from "vitest";
import { createDefaultToolRegistry } from "../../create-default-tools.js";
import { createVisionTools } from "./vision-tools.js";

describe("vision tools", () => {
  it("detect_objects and describe_scene work with mock provider", async () => {
    const registry = createDefaultToolRegistry({ includeVision: true });
    const grantedPermissions = new Set<PermissionId>(["vision"]);

    const detect = await registry.execute(
      { id: "1", name: "detect_objects", arguments: {} },
      { correlationId: "c1", language: "en", grantedPermissions },
    );
    expect(detect.ok).toBe(true);
    const detectResult = detect.result as { count: number };
    expect(detectResult.count).toBeGreaterThan(0);

    const describe = await registry.execute(
      { id: "2", name: "describe_scene", arguments: {} },
      { correlationId: "c2", language: "en", grantedPermissions },
    );
    expect(describe.ok).toBe(true);
    const describeResult = describe.result as { description: string };
    expect(describeResult.description.length).toBeGreaterThan(0);

    const find = await registry.execute(
      { id: "3", name: "find_object", arguments: { label: "cup" } },
      { correlationId: "c3", language: "en", grantedPermissions },
    );
    expect(find.ok).toBe(true);
    const findResult = find.result as { found: boolean };
    expect(findResult.found).toBe(true);
  });

  it("analyzes a live captured frame instead of the empty JPEG stub", async () => {
    const live = Uint8Array.from([0xff, 0xd8, 0x01, 0x02, 0x03, 0xff, 0xd9]);
    const analyzed: Uint8Array[] = [];
    const provider: IVisionProvider = {
      metadata: { id: "live-vision", name: "Live", version: "1" },
      async analyze(image) {
        analyzed.push(image);
        return {
          objects: [
            {
              id: "cup-1",
              label: "cup",
              confidence: 0.9,
              bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            },
          ],
          frameId: "live-1",
        };
      },
    };
    const detect = createVisionTools({
      provider,
      sceneStore: new InMemoryVisionSceneStore(),
      isStreaming: () => true,
      captureFrame: async () => ({ image: live, frameId: "cam-1" }),
    })[0];
    if (!detect) {
      throw new Error("detect_objects tool missing");
    }

    const result = await detect.execute(
      {},
      {
        correlationId: "c-live",
        language: "en",
        grantedPermissions: new Set(["vision"]),
      },
    );
    expect(analyzed).toHaveLength(1);
    expect(analyzed[0]).toBe(live);
    expect((result as { count: number }).count).toBe(1);
  });

  it("refuses the camera while video streaming is off", async () => {
    const provider: IVisionProvider = {
      metadata: { id: "live-vision", name: "Live", version: "1" },
      async analyze() {
        throw new Error("should not analyze");
      },
    };
    const detect = createVisionTools({
      provider,
      sceneStore: new InMemoryVisionSceneStore(),
      isStreaming: () => false,
      captureFrame: async () => {
        throw new Error("should not capture");
      },
    })[0];
    if (!detect) {
      throw new Error("detect_objects tool missing");
    }

    await expect(
      detect.execute(
        {},
        {
          correlationId: "c-off",
          language: "en",
          grantedPermissions: new Set(["vision"]),
        },
      ),
    ).rejects.toThrow(/Video is off/i);
  });
});

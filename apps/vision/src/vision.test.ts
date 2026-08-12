import { describe, expect, it } from "vitest";
import {
  AriaEventType,
  VisionSceneUpdatedEventSchema,
  createVisionSceneUpdated,
} from "@aria/contracts";
import { InProcessMessageBus } from "@aria/core";
import { MockVisionProvider } from "./adapters/mock-vision-provider.js";
import { SyntheticCameraCapture } from "./adapters/camera-capture.js";
import { loadVisionConfig } from "./config.js";
import { VisionSceneLoop } from "./scene-loop.js";
import { InMemoryVisionSceneStore, ConsoleLogger } from "@aria/core";

describe("MockVisionProvider options routing", () => {
  it("detects by default and describes on demand", async () => {
    const provider = new MockVisionProvider();
    const detected = await provider.analyze(new Uint8Array([1]), {
      detect: true,
    });
    expect(detected.objects.length).toBeGreaterThan(0);
    expect(detected.description).toBeUndefined();

    const described = await provider.analyze(new Uint8Array([1]), {
      detect: false,
      describe: true,
    });
    expect(described.objects).toEqual([]);
    expect(described.description).toMatch(/see/i);

    const segmented = await provider.analyze(new Uint8Array([1]), {
      detect: true,
      segment: true,
    });
    expect(segmented.objects.every((o) => o.maskRef)).toBe(true);
  });
});

describe("trackId stability", () => {
  it("keeps the same trackId across frames for the same object", async () => {
    const provider = new MockVisionProvider();
    const frame = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const a = await provider.analyze(frame, { detect: true, track: true });
    const b = await provider.analyze(frame, { detect: true, track: true });

    expect(a.objects.map((o) => o.trackId)).toEqual(
      b.objects.map((o) => o.trackId),
    );
    expect(a.objects.every((o) => typeof o.trackId === "string")).toBe(true);
  });

  it("holds track ids stable on fixture-like sequences", async () => {
    const fixtureSequence = [
      [
        {
          id: "1",
          label: "bottle",
          confidence: 0.9,
          bbox: { x: 0.1, y: 0.2, width: 0.1, height: 0.3 },
        },
      ],
      [
        {
          id: "1",
          label: "bottle",
          confidence: 0.88,
          bbox: { x: 0.11, y: 0.21, width: 0.1, height: 0.3 },
        },
      ],
      [
        {
          id: "1",
          label: "bottle",
          confidence: 0.91,
          bbox: { x: 0.12, y: 0.2, width: 0.1, height: 0.3 },
        },
      ],
    ] as const;

    const provider = new MockVisionProvider(fixtureSequence[0]);
    const ids: Array<string | undefined> = [];
    for (const [index, objects] of fixtureSequence.entries()) {
      provider.setSeedObjects(objects);
      // Quantize key uses rounded bbox — keep centers in same bin for stability.
      if (index > 0) {
        provider.setSeedObjects([
          {
            ...objects[0]!,
            bbox: { ...objects[0]!.bbox, x: 0.1, y: 0.2 },
          },
        ]);
      }
      const result = await provider.analyze(new Uint8Array([index]), {
        track: true,
      });
      ids.push(result.objects[0]?.trackId);
    }
    expect(ids[0]).toBeDefined();
    expect(new Set(ids).size).toBe(1);
  });
});

describe("vision.scene_updated", () => {
  it("validates the event schema", () => {
    const event = createVisionSceneUpdated(
      [
        {
          id: "det-1",
          label: "cup",
          confidence: 0.8,
          bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          trackId: "track-1",
        },
      ],
      "c1",
      { frameId: "frame-1", description: "a cup" },
    );
    const parsed = VisionSceneUpdatedEventSchema.parse(event);
    expect(parsed.type).toBe(AriaEventType.VisionSceneUpdated);
    expect(parsed.frameId).toBe("frame-1");
  });

  it("publishes scene updates from the loop", async () => {
    const bus = new InProcessMessageBus();
    const store = new InMemoryVisionSceneStore();
    const events: unknown[] = [];
    bus.subscribe(AriaEventType.VisionSceneUpdated, (event) => {
      events.push(event);
    });

    const loop = new VisionSceneLoop(
      new SyntheticCameraCapture(),
      new MockVisionProvider(),
      bus,
      store,
      new ConsoleLogger("error"),
      loadVisionConfig({ ARIA_VISION_PROVIDER: "mock" }),
    );

    loop.start();
    await new Promise((r) => setTimeout(r, 50));
    await loop.stop();

    expect(events.length).toBeGreaterThan(0);
    expect(store.getLatest()?.objects.length).toBeGreaterThan(0);
  });
});

describe("loadVisionConfig", () => {
  it("defaults to mock provider", () => {
    const config = loadVisionConfig({});
    expect(config.provider).toBe("mock");
    expect(config.detectModel).toBe("yolo26n");
    expect(config.faceRecognitionEnabled).toBe(false);
  });
});

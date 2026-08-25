import { describe, expect, it, vi } from "vitest";
import {
  AriaEventType,
  VisionSceneUpdatedEventSchema,
  createVisionSceneUpdated,
  type IVisionProvider,
} from "@aria/contracts";
import { InProcessMessageBus } from "@aria/core";
import { MockVisionProvider } from "./adapters/mock-vision-provider.js";
import {
  SyntheticCameraCapture,
  type CameraCapture,
  type CapturedFrame,
  type FrameDelta,
} from "./adapters/camera-capture.js";
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
      ids.push(result.objects[0]?.trackId ?? undefined);
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

  it("can stop and start the scene loop without disposing the provider", async () => {
    const bus = new InProcessMessageBus();
    const store = new InMemoryVisionSceneStore();
    const provider: IVisionProvider = new MockVisionProvider();
    const dispose = vi.fn();
    provider.dispose = dispose;
    const loop = new VisionSceneLoop(
      new SyntheticCameraCapture(),
      provider,
      bus,
      store,
      new ConsoleLogger("error"),
      loadVisionConfig({ ARIA_VISION_PROVIDER: "mock" }),
    );

    loop.start();
    expect(loop.isRunning()).toBe(true);
    await loop.stop();
    expect(loop.isRunning()).toBe(false);
    expect(dispose).not.toHaveBeenCalled();

    loop.start();
    expect(loop.isRunning()).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    await loop.stop();
    expect(store.getLatest()?.objects.length).toBeGreaterThan(0);
  });

  it("skips Gemini/analyze while the sidecar reports an unchanged frame", async () => {
    const bus = new InProcessMessageBus();
    const store = new InMemoryVisionSceneStore();
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    let probes = 0;
    const camera: CameraCapture = {
      async capture(): Promise<CapturedFrame> {
        return { image: jpeg, frameId: "fallback" };
      },
      async captureIfChanged(options): Promise<FrameDelta> {
        probes += 1;
        if (probes === 1 || options?.force === true) {
          return { unchanged: false, frameId: `changed-${probes}`, image: jpeg };
        }
        return { unchanged: true, frameId: `still-${probes}`, mse: 0.4 };
      },
    };
    const provider = new MockVisionProvider();
    const analyze = vi.spyOn(provider, "analyze");
    const loop = new VisionSceneLoop(
      camera,
      provider,
      bus,
      store,
      new ConsoleLogger("error"),
      loadVisionConfig({
        ARIA_VISION_PROVIDER: "mock",
        ARIA_VISION_ANALYZE_INTERVAL_MS: "100",
      }),
    );

    loop.start();
    await waitUntil(() => analyze.mock.calls.length === 1, 1000);
    expect(store.getLatest()?.objects.length).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 220));
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(probes).toBeGreaterThan(1);

    const before = analyze.mock.calls.length;
    await waitUntil(async () => {
      await loop.analyzeOnce({ describe: true });
      return analyze.mock.calls.length > before;
    }, 1000);
    expect(analyze.mock.calls.some((call) => call[1]?.describe === true)).toBe(
      true,
    );

    await loop.stop();
  });
});

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("Timed out waiting for condition");
}

describe("loadVisionConfig", () => {
  it("defaults to mock provider", () => {
    const config = loadVisionConfig({});
    expect(config.provider).toBe("mock");
    expect(config.detectModel).toBe("yolo26n");
    expect(config.faceRecognitionEnabled).toBe(false);
    expect(config.frameDiffEnabled).toBe(true);
    expect(config.frameDiffThreshold).toBe(12);
    expect(config.geminiMinIntervalMs).toBe(4500);
  });

  it("spaces Gemini analysis at 4.5s by default", () => {
    const config = loadVisionConfig({ ARIA_VISION_PROVIDER: "gemini" });
    expect(config.analyzeIntervalMs).toBe(4500);
    expect(config.geminiMinIntervalMs).toBe(4500);
  });
});

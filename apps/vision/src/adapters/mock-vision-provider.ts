import {
  type DetectedObject,
  type IVisionProvider,
  type PluginMetadata,
  type VisionAnalyzeOptions,
  type VisionAnalyzeResult,
} from "@aria/contracts";

/**
 * Deterministic mock for CI / no-GPU runs.
 * When `track` is enabled, identical bbox centers reuse the same trackId.
 */
export class MockVisionProvider implements IVisionProvider {
  readonly metadata: PluginMetadata = {
    id: "mock-vision",
    name: "Mock Vision",
    version: "1.0.0",
  };

  private readonly tracks = new Map<string, string>();
  private nextTrack = 1;
  private frameCounter = 0;

  private seedObjects: DetectedObject[];

  constructor(
    seedObjects: readonly DetectedObject[] = [
      {
        id: "obj-1",
        label: "person",
        confidence: 0.92,
        bbox: { x: 0.2, y: 0.15, width: 0.25, height: 0.6 },
      },
      {
        id: "obj-2",
        label: "cup",
        confidence: 0.81,
        bbox: { x: 0.55, y: 0.55, width: 0.12, height: 0.18 },
      },
    ],
  ) {
    this.seedObjects = [...seedObjects];
  }

  async analyze(
    _image: Uint8Array,
    options: VisionAnalyzeOptions = {},
  ): Promise<VisionAnalyzeResult> {
    const detect = options.detect !== false;
    const track = options.track === true || options.track === undefined;
    const segment = options.segment === true;
    const describe = options.describe === true;
    this.frameCounter += 1;
    const frameId = `mock-frame-${this.frameCounter}`;

    if (!detect && !describe && !segment) {
      return { objects: [], frameId, source: "mock" };
    }

    let objects: DetectedObject[] = [];
    if (detect) {
      objects = this.seedObjects.map((obj, index) => {
        const keyed = `${obj.label}:${Math.round(obj.bbox.x * 100)}:${Math.round(obj.bbox.y * 100)}`;
        let trackId = this.tracks.get(keyed);
        if (track) {
          if (!trackId) {
            trackId = `track-${this.nextTrack}`;
            this.nextTrack += 1;
            this.tracks.set(keyed, trackId);
          }
        }
        return {
          ...obj,
          id: `det-${index + 1}`,
          trackId: track ? trackId : undefined,
          maskRef: segment ? `mask-${index + 1}` : undefined,
        };
      });
    }

    const description = describe
      ? summarizeScene(objects.length > 0 ? objects : this.seedObjects)
      : undefined;

    return { objects, description, frameId, source: "mock" as const };
  }

  /** Test helper: replace seed detections mid-sequence. */
  setSeedObjects(objects: readonly DetectedObject[]): void {
    this.seedObjects = [...objects];
  }
}

function summarizeScene(objects: readonly DetectedObject[]): string {
  if (objects.length === 0) {
    return "I do not see any notable objects.";
  }
  const counts = new Map<string, number>();
  for (const obj of objects) {
    counts.set(obj.label, (counts.get(obj.label) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([label, count]) =>
    count === 1 ? `a ${label}` : `${count} ${label}s`,
  );
  return `I see ${parts.join(", ")}.`;
}

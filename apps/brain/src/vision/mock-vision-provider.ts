import {
  type DetectedObject,
  type IVisionProvider,
  type PluginMetadata,
  type VisionAnalyzeOptions,
  type VisionAnalyzeResult,
} from "@aria/contracts";

/**
 * Brain-local mock so tools work without importing @aria/vision.
 * CI / default path when ARIA_VISION_PROVIDER is unset or "mock".
 */
export class BrainMockVisionProvider implements IVisionProvider {
  readonly metadata: PluginMetadata = {
    id: "mock-vision",
    name: "Mock Vision",
    version: "1.0.0",
  };

  private readonly tracks = new Map<string, string>();
  private nextTrack = 1;

  async analyze(
    _image: Uint8Array,
    options: VisionAnalyzeOptions = {},
  ): Promise<VisionAnalyzeResult> {
    const detect = options.detect !== false;
    const describe = options.describe === true;
    const segment = options.segment === true;
    const track = options.track !== false;

    const seeds: DetectedObject[] = [
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
    ];

    const objects = detect
      ? seeds.map((obj, index) => {
          const keyed = `${obj.label}:${Math.round(obj.bbox.x * 100)}`;
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
        })
      : [];

    return {
      objects,
      description: describe
        ? "I see a person and a cup."
        : undefined,
      frameId: `brain-mock-${Date.now()}`,
    };
  }
}

import type {
  IVisionSceneStore,
  VisionSceneSnapshot,
} from "@aria/contracts";

/**
 * Simple in-memory world model for the latest camera scene + optional frame.
 */
export class InMemoryVisionSceneStore implements IVisionSceneStore {
  private latest?: VisionSceneSnapshot;
  private latestFrame?: Uint8Array;

  getLatest(): VisionSceneSnapshot | undefined {
    return this.latest;
  }

  getLatestFrame(): Uint8Array | undefined {
    return this.latestFrame;
  }

  update(snapshot: VisionSceneSnapshot, frame?: Uint8Array): void {
    this.latest = snapshot;
    if (frame !== undefined) {
      this.latestFrame = frame;
    }
  }

  clear(): void {
    this.latest = undefined;
    this.latestFrame = undefined;
  }
}

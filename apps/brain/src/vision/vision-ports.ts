import type { IVisionProvider, IVisionSceneStore } from "@aria/contracts";

/**
 * Mutable ports bag shared by tools and (optionally) @aria/vision.
 * Vision runtime may replace `provider` without re-registering tools.
 */
export interface VisionPortsBag {
  provider: IVisionProvider;
  sceneStore: IVisionSceneStore;
  /**
   * Live webcam grab (sidecar OpenCV). Preferred over a stored/stub frame so
   * chat tools see the same camera the dashboard preview uses.
   */
  captureFrame?: () => Promise<{ image: Uint8Array; frameId?: string }>;
  /** Continuous preview + scene loop; tools refuse the camera while this is off. */
  isStreaming?: () => boolean;
}

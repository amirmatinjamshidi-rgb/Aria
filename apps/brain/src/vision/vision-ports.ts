import type { IVisionProvider, IVisionSceneStore } from "@aria/contracts";

/**
 * Mutable ports bag shared by tools and (optionally) @aria/vision.
 * Vision runtime may replace `provider` without re-registering tools.
 */
export interface VisionPortsBag {
  provider: IVisionProvider;
  sceneStore: IVisionSceneStore;
}

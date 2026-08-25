import type {
  IMessageBus,
  IVisionProvider,
  IVisionSceneStore,
} from "@aria/contracts";
import {
  InMemoryVisionSceneStore,
  type Logger,
} from "@aria/core";
import {
  SidecarCameraCapture,
  SyntheticCameraCapture,
  type CameraCapture,
} from "./adapters/camera-capture.js";
import { GeminiVisionProvider } from "./adapters/gemini-vision-provider.js";
import { InferenceSidecarClient } from "./adapters/inference-sidecar-client.js";
import { MockVisionProvider } from "./adapters/mock-vision-provider.js";
import { SidecarVisionProvider } from "./adapters/sidecar-vision-provider.js";
import { loadVisionConfig, type VisionConfig } from "./config.js";
import { VisionSceneLoop } from "./scene-loop.js";

export interface VisionCompositionOptions {
  readonly bus: IMessageBus;
  readonly logger: Logger;
  readonly env?: NodeJS.ProcessEnv;
  readonly sceneStore?: IVisionSceneStore;
}

export interface VisionRuntime {
  readonly config: VisionConfig;
  readonly provider: IVisionProvider;
  readonly sceneStore: IVisionSceneStore;
  readonly camera: CameraCapture;
  readonly loop: VisionSceneLoop;
  isStreaming(): boolean;
  start(): void;
  stopStreaming(): Promise<void>;
  stop(): Promise<void>;
}

function createProvider(
  config: VisionConfig,
  logger: Logger,
): { provider: IVisionProvider; camera: CameraCapture; client?: InferenceSidecarClient } {
  switch (config.provider) {
    case "mock":
      return {
        provider: new MockVisionProvider(),
        camera: new SyntheticCameraCapture(),
      };
    case "sidecar": {
      const client = new InferenceSidecarClient(config.sidecarUrl);
      const provider = new SidecarVisionProvider(client, config);
      const camera = config.cameraEnabled
        ? new SidecarCameraCapture(client, config.cameraDevice)
        : new SyntheticCameraCapture();
      logger.info("vision YOLO sidecar provider selected", {
        url: config.sidecarUrl,
        model: config.detectModel,
      });
      return { provider, camera, client };
    }
    case "gemini": {
      // Webcam stays local (OpenCV sidecar); detect/describe use Gemini API.
      const client = new InferenceSidecarClient(config.sidecarUrl);
      const provider = new GeminiVisionProvider(config);
      const camera = config.cameraEnabled
        ? new SidecarCameraCapture(client, config.cameraDevice)
        : new SyntheticCameraCapture();
      logger.info("vision Gemini provider selected", {
        model: config.geminiModel,
        captureSidecar: config.sidecarUrl,
        cameraEnabled: config.cameraEnabled,
      });
      return { provider, camera, client };
    }
    default: {
      const _exhaustive: never = config.provider;
      return _exhaustive;
    }
  }
}

/** The only vision module that knows concrete camera/model adapters. */
export function createVisionRuntime(
  options: VisionCompositionOptions,
): VisionRuntime {
  const config = loadVisionConfig(options.env);
  const logger = options.logger.child({ service: "vision" });
  const sceneStore = options.sceneStore ?? new InMemoryVisionSceneStore();
  const { provider, camera } = createProvider(config, logger);
  const loop = new VisionSceneLoop(
    camera,
    provider,
    options.bus,
    sceneStore,
    logger,
    config,
  );

  return {
    config,
    provider,
    sceneStore,
    camera,
    loop,
    isStreaming() {
      return loop.isRunning();
    },
    start() {
      loop.start();
    },
    async stopStreaming() {
      await loop.stop();
    },
    async stop() {
      await loop.stop();
      await provider.dispose?.();
    },
  };
}

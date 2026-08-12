import {
  AriaEventType,
  createVisionSceneUpdated,
  type IMessageBus,
  type IVisionProvider,
  type IVisionSceneStore,
} from "@aria/contracts";
import type { Logger } from "@aria/core";
import type { CameraCapture } from "./adapters/camera-capture.js";
import type { VisionConfig } from "./config.js";

export class VisionSceneLoop {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private inFlight = false;
  private tick = 0;
  private warnedMock = false;

  constructor(
    private readonly camera: CameraCapture,
    private readonly provider: IVisionProvider,
    private readonly bus: IMessageBus,
    private readonly sceneStore: IVisionSceneStore,
    private readonly logger: Logger,
    private readonly config: VisionConfig,
  ) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.logger.info("vision scene loop started", {
      intervalMs: this.config.analyzeIntervalMs,
      provider: this.provider.metadata.id,
      cameraEnabled: this.config.cameraEnabled,
    });
    void this.analyzeOnce();
    this.timer = setInterval(() => {
      void this.analyzeOnce();
    }, this.config.analyzeIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.provider.dispose?.();
    this.logger.info("vision scene loop stopped");
  }

  async analyzeOnce(options?: {
    readonly describe?: boolean;
    readonly segment?: boolean;
  }): Promise<void> {
    if (this.inFlight || !this.running) {
      return;
    }
    this.inFlight = true;
    this.tick += 1;
    const correlationId = `vision-${this.tick}-${Date.now()}`;

    try {
      const captured = await this.camera.capture();
      const result = await this.provider.analyze(captured.image, {
        detect: true,
        track: this.config.trackEnabled,
        describe: options?.describe === true,
        segment: options?.segment === true,
      });
      const frameId = result.frameId ?? captured.frameId;
      const event = createVisionSceneUpdated(result.objects, correlationId, {
        description: result.description,
        frameId,
        source: result.source,
      });
      this.sceneStore.update(
        {
          objects: event.objects,
          description: event.description,
          frameId: event.frameId,
          correlationId: event.correlationId,
          timestamp: event.timestamp,
        },
        captured.image,
      );
      await this.bus.publish(event);
      this.logger.debug("published vision.scene_updated", {
        objects: event.objects.length,
        frameId: event.frameId,
        source: event.source,
        type: AriaEventType.VisionSceneUpdated,
      });
      if (event.source === "mock" && !this.warnedMock) {
        this.warnedMock = true;
        this.logger.warn(
          "vision is in MOCK mode — restart sidecar without ARIA_VISION_SIDECAR_MODE=mock for real camera",
        );
      }
    } catch (error: unknown) {
      this.logger.warn("vision scene analyze failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.inFlight = false;
    }
  }
}

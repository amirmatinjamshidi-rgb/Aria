import {
  AriaEventType,
  createVisionSceneUpdated,
  type IMessageBus,
  type IVisionProvider,
  type IVisionSceneStore,
} from "@aria/contracts";
import type { Logger } from "@aria/core";
import type { CameraCapture } from "./adapters/camera-capture.js";
import {
  GeminiRateLimitError,
  GeminiVisionProvider,
} from "./adapters/gemini-vision-provider.js";
import type { VisionConfig } from "./config.js";

export class VisionSceneLoop {
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private inFlight = false;
  private tick = 0;
  private warnedMock = false;
  private skippedFrames = 0;
  private currentIntervalMs: number;

  constructor(
    private readonly camera: CameraCapture,
    private readonly provider: IVisionProvider,
    private readonly bus: IMessageBus,
    private readonly sceneStore: IVisionSceneStore,
    private readonly logger: Logger,
    private readonly config: VisionConfig,
  ) {
    this.currentIntervalMs = config.analyzeIntervalMs;
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.logger.info("vision scene loop started", {
      intervalMs: this.currentIntervalMs,
      provider: this.provider.metadata.id,
      cameraEnabled: this.config.cameraEnabled,
    });
    void this.analyzeOnce().finally(() => this.scheduleNext());
  }

  /** Pause the loop. Does not dispose the provider — tools still need it. */
  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
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
      const captured = await this.captureForAnalysis(options);
      if (!captured) {
        this.skippedFrames += 1;
        return;
      }
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
      // Recover toward configured interval after successful analyze.
      this.currentIntervalMs = Math.max(
        this.config.analyzeIntervalMs,
        Math.floor(this.currentIntervalMs * 0.85),
      );
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
      if (error instanceof GeminiRateLimitError) {
        this.currentIntervalMs = Math.min(
          60_000,
          Math.max(error.retryAfterMs, this.currentIntervalMs * 2),
        );
        this.logger.warn("vision rate limited — backing off", {
          retryAfterMs: error.retryAfterMs,
          nextIntervalMs: this.currentIntervalMs,
        });
      } else {
        this.logger.warn("vision scene analyze failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Capture a frame, or return undefined when the scene has not moved.
   *
   * The change probe is far cheaper than an analyze call — a downscaled MSE in
   * the sidecar versus a rate-limited network round trip — so a static desk
   * costs almost nothing and never consumes a Gemini token. An explicit request
   * (`describe`/`segment`) forces a real frame regardless.
   */
  private async captureForAnalysis(options?: {
    readonly describe?: boolean;
    readonly segment?: boolean;
  }): Promise<{ image: Uint8Array; frameId?: string } | undefined> {
    const probe = this.camera.captureIfChanged?.bind(this.camera);
    const onDemand = options?.describe === true || options?.segment === true;

    if (!this.config.frameDiffEnabled || !probe) {
      return await this.camera.capture();
    }

    const delta = await probe({
      force: onDemand,
      threshold: this.config.frameDiffThreshold,
    });

    if (delta.unchanged && !onDemand) {
      const last = this.sceneStore.getLatest();
      if (last) {
        this.logger.debug("frame unchanged — reusing last scene", {
          mse: delta.mse,
          frameId: delta.frameId,
          skippedFrames: this.skippedFrames + 1,
        });
        return undefined;
      }
      // Nothing cached yet, so there is no scene to reuse; analyze anyway.
    }

    if (delta.image) {
      return { image: delta.image, frameId: delta.frameId };
    }
    // `unchanged` with an empty store, or a sidecar that withheld the image.
    return await this.camera.capture();
  }

  private scheduleNext(): void {
    if (!this.running) {
      return;
    }
    let delay = this.currentIntervalMs;
    if (this.provider instanceof GeminiVisionProvider) {
      delay = Math.max(delay, this.provider.cooldownRemainingMs());
    }
    this.timer = setTimeout(() => {
      void this.analyzeOnce().finally(() => this.scheduleNext());
    }, delay);
  }
}

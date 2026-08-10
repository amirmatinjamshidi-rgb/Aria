import {
  type AudioFormat,
  type IVoiceActivityDetector,
  type PluginMetadata,
  type VadFrameResult,
} from "@aria/contracts";
import { z } from "zod";
import type { VoiceConfig } from "../config.js";
import type { InferenceSidecarClient } from "./inference-sidecar-client.js";

const VadResponseSchema = z.object({
  probability: z.number().min(0).max(1),
  speechStarted: z.boolean(),
  speechEnded: z.boolean(),
});

export class SileroVadProvider implements IVoiceActivityDetector {
  readonly metadata: PluginMetadata = {
    id: "silero",
    name: "Silero VAD",
    version: "1.0.0",
  };

  private readonly sessionId = crypto.randomUUID();

  constructor(
    private readonly client: InferenceSidecarClient,
    private readonly config: Pick<
      VoiceConfig,
      "vadThreshold" | "vadMinSilenceMs"
    >,
  ) {}

  async process(
    pcm: Uint8Array,
    format: AudioFormat,
    signal?: AbortSignal,
  ): Promise<VadFrameResult> {
    return this.client.postJson(
      "/v1/vad",
      pcm,
      VadResponseSchema,
      {
        signal,
        headers: {
          "content-type": "application/octet-stream",
          "x-session-id": this.sessionId,
          "x-sample-rate": String(format.sampleRateHz),
          "x-vad-threshold": String(this.config.vadThreshold),
          "x-min-silence-ms": String(this.config.vadMinSilenceMs),
        },
      },
    );
  }

  async reset(): Promise<void> {
    await this.client.postJson(
      "/v1/vad/reset",
      JSON.stringify({ sessionId: this.sessionId }),
      z.object({ ok: z.literal(true) }),
      { headers: { "content-type": "application/json" } },
    );
  }
}

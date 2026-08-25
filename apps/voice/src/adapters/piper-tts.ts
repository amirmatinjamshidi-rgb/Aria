import {
  type ITTSProvider,
  type PcmAudioStream,
  type PluginMetadata,
  type TtsSynthesizeOptions,
} from "@aria/contracts";
import { z } from "zod";
import type { InferenceSidecarClient } from "./inference-sidecar-client.js";
import type { VoiceConfig } from "../config.js";
import { resolveTtsLanguage } from "../language.js";
import { S16leChunkAligner } from "../pcm-bytes.js";

const PiperResponseSchema = z.object({
  audioBase64: z.string(),
  sampleRateHz: z.number().int().positive(),
});

/**
 * Piper TTS adapter. Language auto-selects the voice model:
 * - fa → Ganji (or configured Persian model)
 * - en → Lessac (or configured English model)
 */
export class PiperTtsProvider implements ITTSProvider {
  readonly metadata: PluginMetadata = {
    id: "piper",
    name: "Piper TTS",
    version: "1.1.0",
  };

  constructor(
    private readonly client: InferenceSidecarClient,
    private readonly config: Pick<
      VoiceConfig,
      "piperExecutable" | "piperEnglishModel" | "piperPersianModel"
    >,
  ) {}

  async synthesize(
    text: string,
    options: TtsSynthesizeOptions,
  ): Promise<{ audio: Uint8Array; sampleRateHz: number }> {
    const response = await this.client.postJson(
      "/v1/synthesize",
      JSON.stringify(this.buildRequest(text, options)),
      PiperResponseSchema,
      {
        signal: options.signal,
        headers: { "content-type": "application/json" },
      },
    );
    return {
      audio: Uint8Array.from(Buffer.from(response.audioBase64, "base64")),
      sampleRateHz: response.sampleRateHz,
    };
  }

  async synthesizeStream(
    text: string,
    options: TtsSynthesizeOptions,
  ): Promise<PcmAudioStream> {
    const response = await this.client.postStream(
      "/v1/synthesize/stream",
      JSON.stringify(this.buildRequest(text, options)),
      {
        signal: options.signal,
        headers: { "content-type": "application/json" },
      },
    );

    const body = response.body;
    if (body === null) {
      throw new Error("Piper stream returned no body");
    }

    return {
      sampleRateHz: parseSampleRate(response.headers.get("x-sample-rate")),
      channels: 1,
      chunks: iterateBody(body),
    };
  }

  private buildRequest(
    text: string,
    options: TtsSynthesizeOptions,
  ): Record<string, unknown> {
    const language = resolveTtsLanguage(options.language, text);
    return {
      text,
      model:
        options.voiceId ??
        (language === "fa"
          ? this.config.piperPersianModel
          : this.config.piperEnglishModel),
      language,
      executable: this.config.piperExecutable,
      speakingRate: options.speakingRate,
    };
  }
}

function parseSampleRate(header: string | null): number {
  const value = Number(header);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Piper stream returned an invalid x-sample-rate header: ${String(header)}`,
    );
  }
  return value;
}

async function* iterateBody(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  const aligner = new S16leChunkAligner();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = aligner.flush();
        if (tail) {
          yield tail;
        }
        return;
      }
      if (value && value.byteLength > 0) {
        const aligned = aligner.push(value);
        if (aligned) {
          yield aligned;
        }
      }
    }
  } finally {
    // Barge-in abandons the iterator mid-stream; releasing the lock lets the
    // underlying socket tear down instead of leaking the connection.
    reader.releaseLock();
  }
}

import {
  type ITTSProvider,
  type PluginMetadata,
  type TtsSynthesizeOptions,
} from "@aria/contracts";
import { z } from "zod";
import type { VoiceConfig } from "../config.js";
import type { InferenceSidecarClient } from "./inference-sidecar-client.js";

const PiperResponseSchema = z.object({
  audioBase64: z.string(),
  sampleRateHz: z.number().int().positive(),
});

export class PiperTtsProvider implements ITTSProvider {
  readonly metadata: PluginMetadata = {
    id: "piper",
    name: "Piper TTS",
    version: "1.0.0",
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
    const model =
      options.voiceId ??
      (options.language === "fa"
        ? this.config.piperPersianModel
        : this.config.piperEnglishModel);

    // #region agent log
    fetch('http://127.0.0.1:7428/ingest/11d91261-a0f9-451d-8c69-0c07ca2c5204',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8aa307'},body:JSON.stringify({sessionId:'8aa307',hypothesisId:'B',location:'piper-tts.ts:synthesize',message:'piper synthesize start',data:{model,executable:this.config.piperExecutable,language:options.language,textLen:text.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      const response = await this.client.postJson(
        "/v1/synthesize",
        JSON.stringify({
          text,
          model,
          executable: this.config.piperExecutable,
          speakingRate: options.speakingRate,
        }),
        PiperResponseSchema,
        {
          signal: options.signal,
          headers: { "content-type": "application/json" },
        },
      );
      // #region agent log
      fetch('http://127.0.0.1:7428/ingest/11d91261-a0f9-451d-8c69-0c07ca2c5204',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8aa307'},body:JSON.stringify({sessionId:'8aa307',hypothesisId:'B',location:'piper-tts.ts:synthesize',message:'piper synthesize ok',data:{sampleRateHz:response.sampleRateHz,audioChars:response.audioBase64.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return {
        audio: Uint8Array.from(Buffer.from(response.audioBase64, "base64")),
        sampleRateHz: response.sampleRateHz,
      };
    } catch (error: unknown) {
      // #region agent log
      fetch('http://127.0.0.1:7428/ingest/11d91261-a0f9-451d-8c69-0c07ca2c5204',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8aa307'},body:JSON.stringify({sessionId:'8aa307',hypothesisId:'B',location:'piper-tts.ts:synthesize',message:'piper synthesize failed',data:{message:error instanceof Error ? error.message : String(error)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw error;
    }
  }
}

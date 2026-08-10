import {
  TranscriptionSchema,
  type ISTTProvider,
  type PluginMetadata,
  type SttTranscribeOptions,
  type Transcription,
} from "@aria/contracts";
import type { VoiceConfig } from "../config.js";
import type { InferenceSidecarClient } from "./inference-sidecar-client.js";

export class FasterWhisperProvider implements ISTTProvider {
  readonly metadata: PluginMetadata = {
    id: "faster-whisper",
    name: "Faster-Whisper",
    version: "1.0.0",
  };

  constructor(
    private readonly client: InferenceSidecarClient,
    private readonly config: Pick<
      VoiceConfig,
      "sttModel" | "sttDevice" | "sttComputeType" | "sttBeamSize"
    >,
  ) {}

  async transcribe(
    audio: Uint8Array,
    options: SttTranscribeOptions = {},
  ): Promise<Transcription> {
    const form = new FormData();
    form.append(
      "audio",
      new Blob([audio], { type: "application/octet-stream" }),
      "utterance.pcm",
    );
    form.append("sample_rate_hz", String(options.sampleRateHz ?? 16000));
    form.append("language", options.languageHint ?? "auto");
    form.append("beam_size", String(options.beamSize ?? this.config.sttBeamSize));
    form.append("model", this.config.sttModel);
    form.append("device", this.config.sttDevice);
    form.append("compute_type", this.config.sttComputeType);

    return this.client.postJson(
      "/v1/transcribe",
      form,
      TranscriptionSchema,
      { signal: options.signal },
    );
  }
}

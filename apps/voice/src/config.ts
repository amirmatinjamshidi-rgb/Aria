import { z } from "zod";

export const AudioSourceModeSchema = z.enum([
  "ffmpeg",
  "browser",
  "ffmpeg+browser",
]);
export type AudioSourceMode = z.infer<typeof AudioSourceModeSchema>;

export const VoiceConfigSchema = z.object({
  sidecarUrl: z.string().url().default("http://127.0.0.1:8765"),
  sampleRateHz: z.literal(16000).default(16000),
  chunkDurationMs: z.number().int().min(32).max(256).default(96),
  preSpeechMs: z.number().int().min(0).max(1000).default(288),
  maxUtteranceMs: z.number().int().min(1000).max(120000).default(30000),
  vadThreshold: z.number().min(0).max(1).default(0.5),
  vadMinSilenceMs: z.number().int().min(100).max(3000).default(500),
  sttModel: z.string().default("medium"),
  sttDevice: z.enum(["auto", "cpu", "cuda"]).default("auto"),
  sttComputeType: z.string().default("float16"),
  sttBeamSize: z.number().int().min(1).max(10).default(5),
  piperExecutable: z.string().default("piper"),
  piperEnglishModel: z.string().default("models/piper/en_US-lessac-medium.onnx"),
  piperPersianModel: z.string().default("models/piper/fa_IR-gyro-medium.onnx"),
  ffmpegExecutable: z.string().default("ffmpeg"),
  ffplayExecutable: z.string().default("ffplay"),
  microphoneDevice: z.string().default("default"),
  /** Where microphone PCM originates for continuous capture. */
  audioSourceMode: AudioSourceModeSchema.default("ffmpeg"),
  gatewayHost: z.string().default("127.0.0.1"),
  gatewayPort: z.number().int().min(1).max(65535).default(8787),
});

export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

export function loadVoiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): VoiceConfig {
  return VoiceConfigSchema.parse({
    sidecarUrl: env["ARIA_VOICE_SIDECAR_URL"],
    sampleRateHz: env["ARIA_AUDIO_SAMPLE_RATE"]
      ? Number(env["ARIA_AUDIO_SAMPLE_RATE"])
      : undefined,
    chunkDurationMs: env["ARIA_AUDIO_CHUNK_MS"]
      ? Number(env["ARIA_AUDIO_CHUNK_MS"])
      : undefined,
    preSpeechMs: env["ARIA_VAD_PRE_SPEECH_MS"]
      ? Number(env["ARIA_VAD_PRE_SPEECH_MS"])
      : undefined,
    maxUtteranceMs: env["ARIA_MAX_UTTERANCE_MS"]
      ? Number(env["ARIA_MAX_UTTERANCE_MS"])
      : undefined,
    vadThreshold: env["ARIA_VAD_THRESHOLD"]
      ? Number(env["ARIA_VAD_THRESHOLD"])
      : undefined,
    vadMinSilenceMs: env["ARIA_VAD_MIN_SILENCE_MS"]
      ? Number(env["ARIA_VAD_MIN_SILENCE_MS"])
      : undefined,
    sttModel: env["ARIA_STT_MODEL"],
    sttDevice: env["ARIA_STT_DEVICE"],
    sttComputeType: env["ARIA_STT_COMPUTE_TYPE"],
    sttBeamSize: env["ARIA_STT_BEAM_SIZE"]
      ? Number(env["ARIA_STT_BEAM_SIZE"])
      : undefined,
    piperExecutable: env["ARIA_PIPER_EXECUTABLE"],
    piperEnglishModel: env["ARIA_PIPER_EN_MODEL"],
    piperPersianModel: env["ARIA_PIPER_FA_MODEL"],
    ffmpegExecutable: env["ARIA_FFMPEG_EXECUTABLE"],
    ffplayExecutable: env["ARIA_FFPLAY_EXECUTABLE"],
    microphoneDevice: env["ARIA_MICROPHONE_DEVICE"],
    audioSourceMode: env["ARIA_AUDIO_SOURCE"],
    gatewayHost: env["ARIA_GATEWAY_HOST"],
    gatewayPort: env["ARIA_GATEWAY_PORT"]
      ? Number(env["ARIA_GATEWAY_PORT"])
      : undefined,
  });
}

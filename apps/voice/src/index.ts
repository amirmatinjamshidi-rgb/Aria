export { createVoicePipeline, type VoiceCompositionOptions } from "./composition-root.js";
export {
  loadVoiceConfig,
  VoiceConfigSchema,
  AudioSourceModeSchema,
  type VoiceConfig,
  type AudioSourceMode,
} from "./config.js";
export {
  VoicePipeline,
  type AmplitudeListener,
  type AudioChunkOrigin,
} from "./voice-pipeline.js";
export { VoiceStateMachine } from "./voice-state-machine.js";
export {
  extractAmplitudeEnvelope,
  pcmPeakAmplitude,
} from "./audio-amplitude.js";
export { FasterWhisperProvider } from "./adapters/faster-whisper-stt.js";
export { FfmpegAudioSource } from "./adapters/ffmpeg-audio-source.js";
export { FallbackAudioSource } from "./adapters/fallback-audio-source.js";
export { IdleAudioSource } from "./adapters/idle-audio-source.js";
export { FfplayAudioPlayback } from "./adapters/ffplay-audio-playback.js";
export { InferenceSidecarClient } from "./adapters/inference-sidecar-client.js";
export { PiperTtsProvider } from "./adapters/piper-tts.js";
export { SileroVadProvider } from "./adapters/silero-vad.js";
export {
  createVoiceWebGateway,
  type VoiceWebGateway,
  type VoiceWebGatewayOptions,
} from "./gateway/web-gateway.js";

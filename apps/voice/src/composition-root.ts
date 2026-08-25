import type { IAudioPlayback, IAudioSource, IMessageBus } from "@aria/contracts";
import type { Logger } from "@aria/core";
import { FasterWhisperProvider } from "./adapters/faster-whisper-stt.js";
import { FallbackAudioSource } from "./adapters/fallback-audio-source.js";
import { FfmpegAudioSource } from "./adapters/ffmpeg-audio-source.js";
import { FfplayAudioPlayback } from "./adapters/ffplay-audio-playback.js";
import { IdleAudioSource } from "./adapters/idle-audio-source.js";
import { InferenceSidecarClient } from "./adapters/inference-sidecar-client.js";
import { PiperTtsProvider } from "./adapters/piper-tts.js";
import { SileroVadProvider } from "./adapters/silero-vad.js";
import { loadVoiceConfig, type VoiceConfig } from "./config.js";
import { assertPiperModelsExist } from "./model-paths.js";
import { VoicePipeline } from "./voice-pipeline.js";

export interface VoiceCompositionOptions {
  readonly bus: IMessageBus;
  readonly logger: Logger;
  readonly env?: NodeJS.ProcessEnv;
  /** Override the default ffplay sink (web lab plays in the browser instead). */
  readonly playback?: IAudioPlayback;
}

function createAudioSource(
  config: VoiceConfig,
  logger: Logger,
): IAudioSource {
  const idle = new IdleAudioSource(config.sampleRateHz);

  switch (config.audioSourceMode) {
    case "browser":
      return idle;
    case "ffmpeg":
    case "ffmpeg+browser": {
      const ffmpeg = new FfmpegAudioSource({
        executable: config.ffmpegExecutable,
        device: config.microphoneDevice,
        sampleRateHz: config.sampleRateHz,
        chunkDurationMs: config.chunkDurationMs,
      });
      return new FallbackAudioSource(ffmpeg, idle, (error) => {
        logger.warn(
          "system microphone failed — continuing with browser/text input only",
          {
            error: error instanceof Error ? error.message : String(error),
            hint: "Fix ARIA_MICROPHONE_DEVICE or set ARIA_AUDIO_SOURCE=browser",
          },
        );
      });
    }
    default: {
      const _exhaustive: never = config.audioSourceMode;
      return _exhaustive;
    }
  }
}

/** The only voice module that knows concrete audio/model adapters. */
export function createVoicePipeline(
  options: VoiceCompositionOptions,
): VoicePipeline {
  const config = loadVoiceConfig(options.env);
  const logger = options.logger.child({ service: "voice" });
  if (options.env?.["ARIA_SKIP_MODEL_CHECK"] !== "true") {
    assertPiperModelsExist(config.piperEnglishModel, config.piperPersianModel);
  }
  const sidecar = new InferenceSidecarClient(config.sidecarUrl);
  const source = createAudioSource(config, logger);
  const playback =
    options.playback ?? new FfplayAudioPlayback(config.ffplayExecutable);
  const vad = new SileroVadProvider(sidecar, config);
  const stt = new FasterWhisperProvider(sidecar, config);
  const tts = new PiperTtsProvider(sidecar, config);

  return new VoicePipeline(
    source,
    playback,
    vad,
    stt,
    tts,
    options.bus,
    logger,
    config,
  );
}

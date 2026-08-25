import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrainContainer, resolveBrainPorts } from "@aria/brain";
import { UserSettingsStore } from "@aria/core";
import { createVisionRuntime } from "@aria/vision";
import { createVoicePipeline } from "./composition-root.js";
import { RemoteAudioPlayback } from "./adapters/remote-audio-playback.js";
import { defaultRepoRootEnv } from "./model-paths.js";
import { loadVoiceConfig } from "./config.js";
import { createVoiceWebGateway } from "./gateway/web-gateway.js";

function loadEnvFiles(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../.env"),
    resolve(here, "../../vision/.env"),
    resolve(here, "../../../.env"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotenv({ path, override: false });
    }
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  process.env.ARIA_REPO_ROOT ??= defaultRepoRootEnv();
  // Web UI defaults: keep gateway up even if the system mic is missing.
  process.env.ARIA_AUDIO_SOURCE ??= "ffmpeg+browser";

  const userSettings = new UserSettingsStore();
  await userSettings.load();
  const runtimeEnv = userSettings.applyToEnv(process.env);
  // Propagate merged provider choices to child processes / later reads.
  Object.assign(process.env, runtimeEnv);

  const voiceConfig = loadVoiceConfig(runtimeEnv);
  const { container, conversation, visionPorts } =
    await createBrainContainer(runtimeEnv);
  const { bus, logger } = resolveBrainPorts(container);
  const stopConversation = conversation.start();

  const vision = createVisionRuntime({
    bus,
    logger,
    env: runtimeEnv,
    sceneStore: visionPorts.sceneStore,
  });
  // Shared mutable ports bag — chat tools see the live camera provider.
  visionPorts.provider = vision.provider;
  visionPorts.captureFrame = () => vision.camera.capture();
  visionPorts.isStreaming = () => vision.isStreaming();

  const playback = new RemoteAudioPlayback();
  const voice = createVoicePipeline({
    bus,
    logger,
    env: runtimeEnv,
    playback,
  });
  const gateway = createVoiceWebGateway({
    host: voiceConfig.gatewayHost,
    port: voiceConfig.gatewayPort,
    bus,
    voice,
    conversation,
    config: voiceConfig,
    logger: logger.child({ service: "voice-gateway" }),
    sidecarUrl: voiceConfig.sidecarUrl,
    visionSceneStore: visionPorts.sceneStore,
    visionSidecarUrl: vision.config.sidecarUrl,
    visionCameraDevice: vision.config.cameraDevice,
    remoteAudio: playback,
    visionStream: {
      available: vision.config.enabled,
      isActive: () => vision.isStreaming(),
      start: () => vision.start(),
      stop: () => vision.stopStreaming(),
    },
    userSettings,
  });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    logger.info("shutting down voice web gateway");
    await gateway.stop();
    await vision.stop();
    await voice.stop("shutdown");
    stopConversation();
    await bus.dispose?.();
  };

  await gateway.start();
  logger.info("vision camera idle until Start video", {
    available: vision.config.enabled,
    provider: vision.config.provider,
    sidecarUrl: vision.config.sidecarUrl,
  });

  logger.info("starting Aria voice runtime with web gateway", {
    hint: "Open the dashboard, click Start video, and press Ctrl+C here to stop",
    gateway: gateway.url,
    audioSourceMode: voiceConfig.audioSourceMode,
    visionProvider: vision.config.provider,
    visionEnabled: vision.config.enabled,
    userSettingsPath: userSettings.path,
  });

  // Capture runs until shutdown; FallbackAudioSource keeps us alive if ffmpeg fails.
  void voice.start().catch((error: unknown) => {
    logger.error("voice pipeline stopped unexpectedly", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  await new Promise<void>((resolvePromise) => {
    const onStop = () => {
      void shutdown().finally(() => resolvePromise());
    };
    process.once("SIGINT", onStop);
    process.once("SIGTERM", onStop);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

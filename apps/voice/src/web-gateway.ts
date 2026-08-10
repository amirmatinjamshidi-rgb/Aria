import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrainContainer, resolveBrainPorts } from "@aria/brain";
import { createVoicePipeline } from "./composition-root.js";
import { loadVoiceConfig } from "./config.js";
import { createVoiceWebGateway } from "./gateway/web-gateway.js";

function loadEnvFiles(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../.env"),
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
  // Web UI defaults: keep gateway up even if the system mic is missing.
  process.env.ARIA_AUDIO_SOURCE ??= "ffmpeg+browser";

  const voiceConfig = loadVoiceConfig(process.env);
  const { container, conversation } = await createBrainContainer(process.env);
  const { bus, logger } = resolveBrainPorts(container);
  const stopConversation = conversation.start();
  const voice = createVoicePipeline({ bus, logger, env: process.env });
  const gateway = createVoiceWebGateway({
    host: voiceConfig.gatewayHost,
    port: voiceConfig.gatewayPort,
    bus,
    voice,
    conversation,
    config: voiceConfig,
    logger: logger.child({ service: "voice-gateway" }),
    sidecarUrl: voiceConfig.sidecarUrl,
  });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    logger.info("shutting down voice web gateway");
    await gateway.stop();
    await voice.stop("shutdown");
    stopConversation();
    await bus.dispose?.();
  };

  await gateway.start();
  logger.info("starting Aria voice runtime with web gateway", {
    hint: "Open the dashboard and press Ctrl+C here to stop",
    gateway: gateway.url,
    audioSourceMode: voiceConfig.audioSourceMode,
  });

  // Capture runs until shutdown; FallbackAudioSource keeps us alive if ffmpeg fails.
  void voice.start().catch((error: unknown) => {
    logger.error("voice pipeline stopped unexpectedly", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  await new Promise<void>((resolve) => {
    const onStop = () => {
      void shutdown().finally(() => resolve());
    };
    process.once("SIGINT", onStop);
    process.once("SIGTERM", onStop);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

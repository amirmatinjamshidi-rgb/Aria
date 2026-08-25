import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrainContainer, resolveBrainPorts } from "@aria/brain";
import { createVisionRuntime } from "./composition-root.js";

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
  const { container, conversation, visionPorts } =
    await createBrainContainer(process.env);
  const { bus, logger } = resolveBrainPorts(container);
  const stopConversation = conversation.start();

  const vision = createVisionRuntime({
    bus,
    logger,
    env: process.env,
    sceneStore: visionPorts.sceneStore,
  });

  // Swap the mutable ports bag so brain tools use the real camera + provider.
  visionPorts.provider = vision.provider;
  visionPorts.captureFrame = () => vision.camera.capture();
  visionPorts.isStreaming = () => vision.isStreaming();

  let stopping = false;
  const shutdown = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    logger.info("shutting down vision runtime");
    await vision.stop();
    stopConversation();
    await bus.dispose?.();
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });

  logger.info("starting Aria vision runtime", {
    provider: vision.config.provider,
    hint: "Press Ctrl+C to stop",
  });
  vision.start();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

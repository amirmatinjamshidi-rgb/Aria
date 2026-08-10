import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrainContainer, resolveBrainPorts } from "@aria/brain";
import { createVoicePipeline } from "./composition-root.js";

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
  const { container, conversation } = await createBrainContainer(process.env);
  const { bus, logger } = resolveBrainPorts(container);
  const stopConversation = conversation.start();
  const voice = createVoicePipeline({ bus, logger, env: process.env });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    logger.info("shutting down continuous voice pipeline");
    await voice.stop("shutdown");
    stopConversation();
    await bus.dispose?.();
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });

  logger.info("starting Aria voice runtime", {
    hint: "Press Ctrl+C to stop",
  });
  await voice.start();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

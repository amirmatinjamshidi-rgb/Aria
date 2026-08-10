import {
  AriaEventType,
  createAssistantReply,
  createUserUtterance,
} from "@aria/contracts";
import { InProcessMessageBus, type Logger } from "@aria/core";
import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { ConversationService } from "@aria/brain";
import { loadVoiceConfig } from "../config.js";
import type { VoicePipeline } from "../voice-pipeline.js";
import { createVoiceWebGateway } from "./web-gateway.js";

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child() {
    return this;
  },
};

async function allocatePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) =>
    probe.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = probe.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate test port");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

describe("createVoiceWebGateway", () => {
  it("POST /api/chat delegates to submitText and returns the reply", async () => {
    const bus = new InProcessMessageBus();
    const submitText = vi.fn().mockResolvedValue("gateway reply");
    const voice = {
      submitText,
      snapshot: () => ({ state: "listening" as const }),
      setAmplitudeListener: vi.fn(),
      setBrowserCaptureActive: vi.fn(),
      acceptAudioChunk: vi.fn(),
      interrupt: vi.fn(),
    } as unknown as VoicePipeline;
    const conversation = {
      clearHistory: vi.fn(),
    } as unknown as ConversationService;

    const port = await allocatePort();
    const gateway = createVoiceWebGateway({
      host: "127.0.0.1",
      port,
      bus,
      voice,
      conversation,
      config: loadVoiceConfig({ ARIA_AUDIO_SOURCE: "browser" }),
      logger,
      sidecarUrl: "http://127.0.0.1:8765",
    });

    await gateway.start();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello gateway" }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { reply: string };
      expect(body.reply).toBe("gateway reply");
      expect(submitText).toHaveBeenCalledWith(
        "hello gateway",
        "en",
        expect.any(String),
      );

      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(200);
    } finally {
      await gateway.stop();
    }
  });

  it("forwards assistant replies over the websocket", async () => {
    const bus = new InProcessMessageBus();
    const voice = {
      submitText: vi.fn(),
      snapshot: () => ({ state: "listening" as const }),
      setAmplitudeListener: vi.fn(),
      setBrowserCaptureActive: vi.fn(),
      acceptAudioChunk: vi.fn(),
      interrupt: vi.fn(),
    } as unknown as VoicePipeline;
    const conversation = {
      clearHistory: vi.fn(),
    } as unknown as ConversationService;

    const port = await allocatePort();
    const gateway = createVoiceWebGateway({
      host: "127.0.0.1",
      port,
      bus,
      voice,
      conversation,
      config: loadVoiceConfig({}),
      logger,
      sidecarUrl: "http://127.0.0.1:8765",
    });
    await gateway.start();

    try {
      const messages: Array<{ type?: string }> = [];
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      ws.on("message", (data) => {
        messages.push(JSON.parse(data.toString()) as { type?: string });
      });

      await bus.publish(createUserUtterance("hi", "en", "c-ws"));
      await bus.publish(createAssistantReply("hello there", "en", "c-ws"));

      await vi.waitFor(() => {
        expect(
          messages.some(
            (m) => m.type === AriaEventType.ConversationAssistantReply,
          ),
        ).toBe(true);
      });

      ws.close();
    } finally {
      await gateway.stop();
    }
  });
});

import {
  AriaEventType,
  type AriaEvent,
  type AriaEventTypeName,
  type IMessageBus,
  type LanguageCode,
} from "@aria/contracts";
import { detectLanguage, type ConversationService } from "@aria/brain";
import type { Logger } from "@aria/core";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { VoiceConfig } from "../config.js";
import type { VoicePipeline } from "../voice-pipeline.js";

const FORWARDED_EVENTS: ReadonlySet<AriaEventTypeName> = new Set([
  AriaEventType.VoiceStateChanged,
  AriaEventType.VoiceSpeechStarted,
  AriaEventType.VoiceTranscriptionCompleted,
  AriaEventType.VoiceInterrupted,
  AriaEventType.VoiceTurnMetrics,
  AriaEventType.ConversationUserUtterance,
  AriaEventType.ConversationAssistantReply,
]);

export interface VoiceWebGatewayOptions {
  readonly host: string;
  readonly port: number;
  readonly bus: IMessageBus;
  readonly voice: VoicePipeline;
  readonly conversation: ConversationService;
  readonly config: VoiceConfig;
  readonly logger: Logger;
  readonly sidecarUrl: string;
}

export interface VoiceWebGateway {
  readonly url: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

type InboundMessage =
  | { type: "chat"; text: string; language?: LanguageCode | "auto" }
  | { type: "pcm"; data: string }
  | { type: "control"; action: "interrupt" | "clear_history" | "ptt_start" | "ptt_stop" };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(payload);
}

/**
 * Local HTTP + WebSocket bridge so the dashboard can talk to brain+voice
 * without importing sibling apps.
 */
export function createVoiceWebGateway(
  options: VoiceWebGatewayOptions,
): VoiceWebGateway {
  const clients = new Set<WebSocket>();
  const unsubscribers: Array<() => void> = [];
  let server: Server | undefined;
  let wss: WebSocketServer | undefined;

  const safeSend = (client: WebSocket, raw: string): void => {
    if (client.readyState !== client.OPEN) {
      return;
    }
    try {
      client.send(raw);
    } catch {
      clients.delete(client);
    }
  };

  const broadcast = (message: unknown): void => {
    const raw = JSON.stringify(message);
    for (const client of clients) {
      safeSend(client, raw);
    }
  };

  const handleChat = async (
    text: string,
    languageHint: LanguageCode | "auto" = "auto",
  ): Promise<{ correlationId: string; reply: string; language: LanguageCode }> => {
    const language = detectLanguage(text, languageHint);
    const correlationId = crypto.randomUUID();
    const reply = await options.voice.submitText(text, language, correlationId);
    return { correlationId, reply, language };
  };

  const handleInbound = async (
    raw: string,
    ws: WebSocket,
  ): Promise<void> => {
    let message: InboundMessage;
    try {
      message = JSON.parse(raw) as InboundMessage;
    } catch {
      safeSend(ws, JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (message.type) {
      case "chat": {
        try {
          const result = await handleChat(message.text, message.language ?? "auto");
          safeSend(
            ws,
            JSON.stringify({
              type: "chat_ack",
              correlationId: result.correlationId,
              reply: result.reply,
              language: result.language,
            }),
          );
        } catch (error: unknown) {
          safeSend(
            ws,
            JSON.stringify({
              type: "error",
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        }
        break;
      }
      case "pcm": {
        try {
          const pcm = Uint8Array.from(Buffer.from(message.data, "base64"));
          await options.voice.acceptAudioChunk(pcm, "browser");
        } catch (error: unknown) {
          options.logger.warn("browser pcm chunk failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        break;
      }
      case "control": {
        switch (message.action) {
          case "interrupt":
            await options.voice.interrupt("stop");
            break;
          case "clear_history":
            options.conversation.clearHistory();
            broadcast({ type: "history_cleared", timestamp: new Date().toISOString() });
            break;
          case "ptt_start":
            options.voice.setBrowserCaptureActive(true);
            break;
          case "ptt_stop":
            options.voice.setBrowserCaptureActive(false);
            break;
          default: {
            const _exhaustive: never = message.action;
            void _exhaustive;
            break;
          }
        }
        break;
      }
      default: {
        const _exhaustive: never = message;
        void _exhaustive;
        break;
      }
    }
  };

  return {
    url: `http://${options.host}:${options.port}`,
    async start() {
      options.voice.setAmplitudeListener((level) => {
        broadcast({
          type: "voice.amplitude",
          level,
          timestamp: new Date().toISOString(),
        });
      });

      for (const eventType of FORWARDED_EVENTS) {
        const unsub = options.bus.subscribe(eventType, (event: AriaEvent) => {
          broadcast({ type: event.type, event });
        });
        unsubscribers.push(unsub);
      }

      server = createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://${options.host}:${options.port}`);

        if (req.method === "OPTIONS") {
          sendJson(res, 204, {});
          return;
        }

        if (req.method === "GET" && url.pathname === "/health") {
          sendJson(res, 200, {
            ok: true,
            snapshot: options.voice.snapshot(),
            audioSourceMode: options.config.audioSourceMode,
            sidecarUrl: options.sidecarUrl,
          });
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/chat") {
          try {
            const body = JSON.parse(await readBody(req)) as {
              text?: string;
              language?: LanguageCode | "auto";
            };
            if (!body.text?.trim()) {
              sendJson(res, 400, { error: "text is required" });
              return;
            }
            const result = await handleChat(body.text, body.language ?? "auto");
            sendJson(res, 200, result);
          } catch (error: unknown) {
            sendJson(res, 500, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }

        sendJson(res, 404, { error: "Not found" });
      });

      wss = new WebSocketServer({ server, path: "/ws" });
      wss.on("connection", (ws) => {
        clients.add(ws);
        ws.on("error", (error) => {
          clients.delete(ws);
          options.logger.warn("websocket client error", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        safeSend(
          ws,
          JSON.stringify({
            type: "hello",
            snapshot: options.voice.snapshot(),
            timestamp: new Date().toISOString(),
          }),
        );
        ws.on("message", (data) => {
          void handleInbound(data.toString(), ws);
        });
        ws.on("close", () => {
          clients.delete(ws);
        });
      });

      await new Promise<void>((resolve, reject) => {
        server!.listen(options.port, options.host, () => resolve());
        server!.once("error", reject);
      });

      options.logger.info("voice web gateway listening", {
        url: `http://${options.host}:${options.port}`,
        ws: `ws://${options.host}:${options.port}/ws`,
      });
    },
    async stop() {
      options.voice.setAmplitudeListener(undefined);
      for (const unsub of unsubscribers.splice(0)) {
        unsub();
      }
      for (const client of clients) {
        client.close();
      }
      clients.clear();
      await new Promise<void>((resolve) => {
        wss?.close(() => resolve());
        if (!wss) {
          resolve();
        }
      });
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;
      wss = undefined;
    },
  };
}

"use client";

import {
  gatewayWsUrl,
  type AriaUiState,
  type GatewayAmplitudeMessage,
  type GatewayAudioPcmMessage,
  type GatewayAudioStartMessage,
  type GatewayAudioStopMessage,
  type GatewayErrorMessage,
  type GatewayHelloMessage,
  type TranscriptLine,
  type VisionDetectedObject,
  type VisionSceneView,
} from "./types";
import { decodeBase64Pcm } from "./browser-pcm-player";

export interface AriaSessionHandlers {
  readonly onState: (state: AriaUiState) => void;
  readonly onAmplitude: (level: number) => void;
  readonly onAudioStart?: (sampleRateHz: number) => void;
  readonly onAudioPcm?: (pcm: Uint8Array) => void;
  readonly onAudioStop?: (reason?: "end" | "interrupt") => void;
  readonly onTranscript: (line: TranscriptLine) => void;
  readonly onConnection: (connected: boolean) => void;
  readonly onError: (message: string) => void;
  readonly onSceneSummary?: (summary: string) => void;
  readonly onSceneUpdate?: (scene: VisionSceneView) => void;
}

interface BusEventPayload {
  readonly type: string;
  readonly text?: string;
  readonly language?: string;
  readonly correlationId?: string;
  readonly current?: AriaUiState;
  readonly objects?: unknown;
  readonly description?: string;
  readonly source?: "mock" | "live";
  readonly frameId?: string;
}

function parseObjects(value: unknown): VisionDetectedObject[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: VisionDetectedObject[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const bboxRaw = record["bbox"];
    if (!bboxRaw || typeof bboxRaw !== "object") {
      continue;
    }
    const bbox = bboxRaw as Record<string, unknown>;
    const label = typeof record["label"] === "string" ? record["label"] : "object";
    const id = typeof record["id"] === "string" ? record["id"] : label;
    const confidence =
      typeof record["confidence"] === "number" ? record["confidence"] : 0;
    const x = typeof bbox["x"] === "number" ? bbox["x"] : 0;
    const y = typeof bbox["y"] === "number" ? bbox["y"] : 0;
    const width = typeof bbox["width"] === "number" ? bbox["width"] : 0;
    const height = typeof bbox["height"] === "number" ? bbox["height"] : 0;
    const trackId =
      typeof record["trackId"] === "string" ? record["trackId"] : undefined;
    out.push({
      id,
      label,
      confidence,
      bbox: { x, y, width, height },
      trackId,
    });
  }
  return out;
}

export class AriaGatewaySession {
  private ws?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(private readonly handlers: AriaSessionHandlers) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = undefined;
    this.handlers.onConnection(false);
  }

  sendChat(text: string, language: "en" | "fa" | "auto" = "auto"): void {
    this.send({ type: "chat", text, language });
  }

  setPushToTalk(active: boolean): void {
    this.send({
      type: "control",
      action: active ? "ptt_start" : "ptt_stop",
    });
  }

  sendPcm(pcm: Uint8Array): void {
    let binary = "";
    for (let i = 0; i < pcm.byteLength; i += 1) {
      binary += String.fromCharCode(pcm[i]!);
    }
    const data = btoa(binary);
    this.send({ type: "pcm", data });
  }

  interrupt(): void {
    this.send({ type: "control", action: "interrupt" });
  }

  clearHistory(): void {
    this.send({ type: "control", action: "clear_history" });
  }

  private open(): void {
    const ws = new WebSocket(gatewayWsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.handlers.onConnection(true);
    };

    ws.onclose = () => {
      this.handlers.onConnection(false);
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => this.open(), 1500);
      }
    };

    ws.onerror = () => {
      this.handlers.onError("Gateway connection error");
    };

    ws.onmessage = (event) => {
      try {
        this.handleMessage(JSON.parse(String(event.data)) as Record<string, unknown>);
      } catch {
        this.handlers.onError("Malformed gateway message");
      }
    };
  }

  private handleMessage(message: Record<string, unknown>): void {
    const type = typeof message.type === "string" ? message.type : "";

    switch (type) {
      case "hello": {
        const hello = message as unknown as GatewayHelloMessage;
        this.handlers.onState(hello.snapshot.state);
        return;
      }
      case "voice.amplitude": {
        const amp = message as unknown as GatewayAmplitudeMessage;
        this.handlers.onAmplitude(amp.level);
        return;
      }
      case "voice.audio_start": {
        const start = message as unknown as GatewayAudioStartMessage;
        this.handlers.onAudioStart?.(start.sampleRateHz);
        return;
      }
      case "voice.audio_pcm": {
        const pcm = message as unknown as GatewayAudioPcmMessage;
        this.handlers.onAudioPcm?.(decodeBase64Pcm(pcm.data));
        return;
      }
      case "voice.audio_stop": {
        const stop = message as unknown as GatewayAudioStopMessage;
        this.handlers.onAudioStop?.(stop.reason);
        return;
      }
      case "chat_ack":
      case "history_cleared":
        return;
      case "error": {
        const err = message as unknown as GatewayErrorMessage;
        this.handlers.onError(err.message);
        return;
      }
      default: {
        const event = message.event as BusEventPayload | undefined;
        if (!event || typeof event.type !== "string") {
          return;
        }
        if (event.type === "voice.state_changed" && event.current) {
          this.handlers.onState(event.current);
        }
        if (
          event.type === "conversation.user_utterance" &&
          typeof event.text === "string"
        ) {
          this.handlers.onTranscript({
            id: `${event.correlationId ?? crypto.randomUUID()}-user`,
            role: "user",
            text: event.text,
            language: event.language,
          });
        }
        if (
          event.type === "conversation.assistant_reply" &&
          typeof event.text === "string"
        ) {
          this.handlers.onTranscript({
            id: `${event.correlationId ?? crypto.randomUUID()}-assistant`,
            role: "assistant",
            text: event.text,
            language: event.language,
          });
        }
        if (event.type === "vision.scene_updated") {
          const objects = parseObjects(event.objects);
          const counts = new Map<string, number>();
          for (const obj of objects) {
            counts.set(obj.label, (counts.get(obj.label) ?? 0) + 1);
          }
          const parts = [...counts.entries()].map(([label, count]) =>
            count === 1 ? label : `${count}× ${label}`,
          );
          const body =
            event.description?.trim() ||
            (parts.length > 0 ? parts.join(", ") : "no objects");
          const summary =
            event.source === "mock" ? `MOCK (not camera): ${body}` : body;
          this.handlers.onSceneSummary?.(summary);
          this.handlers.onSceneUpdate?.({
            summary,
            objects,
            source: event.source,
            frameId: event.frameId,
            description: event.description,
          });
        }
      }
    }
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.handlers.onError("Not connected to Aria gateway");
    }
  }
}

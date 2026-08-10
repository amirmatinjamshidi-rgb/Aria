"use client";

import {
  gatewayWsUrl,
  type AriaUiState,
  type GatewayAmplitudeMessage,
  type GatewayErrorMessage,
  type GatewayHelloMessage,
  type TranscriptLine,
} from "./types";

export interface AriaSessionHandlers {
  readonly onState: (state: AriaUiState) => void;
  readonly onAmplitude: (level: number) => void;
  readonly onTranscript: (line: TranscriptLine) => void;
  readonly onConnection: (connected: boolean) => void;
  readonly onError: (message: string) => void;
}

interface BusEventPayload {
  readonly type: string;
  readonly text?: string;
  readonly language?: string;
  readonly correlationId?: string;
  readonly current?: AriaUiState;
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

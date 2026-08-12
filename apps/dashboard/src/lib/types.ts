export type AriaUiState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "stopping"
  | "error";

export type TranscriptRole = "user" | "assistant";

export interface TranscriptLine {
  readonly id: string;
  readonly role: TranscriptRole;
  readonly text: string;
  readonly language?: string;
}

export interface VisionBBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VisionDetectedObject {
  readonly id: string;
  readonly label: string;
  readonly confidence: number;
  readonly bbox: VisionBBox;
  readonly trackId?: string | null;
}

export interface VisionSceneView {
  readonly summary: string;
  readonly objects: readonly VisionDetectedObject[];
  readonly source?: "mock" | "live";
  readonly frameId?: string;
  readonly description?: string;
}

export interface GatewayHelloMessage {
  readonly type: "hello";
  readonly snapshot: { readonly state: AriaUiState };
  readonly timestamp: string;
}

export interface GatewayAmplitudeMessage {
  readonly type: "voice.amplitude";
  readonly level: number;
  readonly timestamp: string;
}

export interface GatewayChatAckMessage {
  readonly type: "chat_ack";
  readonly reply: string;
}

export interface GatewayHistoryClearedMessage {
  readonly type: "history_cleared";
}

export interface GatewayErrorMessage {
  readonly type: "error";
  readonly message: string;
}

export interface GatewayBusEventMessage {
  readonly type: string;
  readonly event: {
    readonly type: string;
    readonly text?: string;
    readonly language?: string;
    readonly correlationId?: string;
    readonly previous?: AriaUiState;
    readonly current?: AriaUiState;
  };
}

export type GatewayOutboundMessage =
  | GatewayHelloMessage
  | GatewayAmplitudeMessage
  | GatewayChatAckMessage
  | GatewayHistoryClearedMessage
  | GatewayErrorMessage
  | GatewayBusEventMessage;

export function gatewayHttpUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ARIA_GATEWAY_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8787"
  );
}

export function gatewayWsUrl(): string {
  const http = gatewayHttpUrl();
  const url = new URL(http);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  return url.toString();
}

export function visionFrameUrl(options?: {
  readonly live?: boolean;
  readonly bust?: string | number;
}): string {
  const url = new URL(`${gatewayHttpUrl()}/api/vision/frame`);
  if (options?.live !== false) {
    url.searchParams.set("live", "1");
  }
  if (options?.bust !== undefined) {
    url.searchParams.set("t", String(options.bust));
  }
  return url.toString();
}

export function statusLabel(state: AriaUiState): string {
  switch (state) {
    case "idle":
      return "Ready";
    case "listening":
      return "Listening";
    case "transcribing":
      return "Transcribing";
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    case "stopping":
      return "Stopping";
    case "error":
      return "Error";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

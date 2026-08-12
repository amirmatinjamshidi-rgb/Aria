"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserPcmStreamer } from "@/lib/browser-pcm";
import { AriaGatewaySession } from "@/lib/gateway-client";
import type { AriaUiState, TranscriptLine, VisionSceneView } from "@/lib/types";
import { ChatDock } from "./ChatDock";
import { expressionFromUiState, RobotFace } from "./robot-face";
import { StatusLine } from "./StatusLine";
import { TranscriptStrip } from "./TranscriptStrip";
import { VisionPreview } from "./VisionPreview";

export function AriaScene() {
  const [state, setState] = useState<AriaUiState>("idle");
  const [amplitude, setAmplitude] = useState(0);
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [micActive, setMicActive] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [sceneSummary, setSceneSummary] = useState<string | null>(null);
  const [visionScene, setVisionScene] = useState<VisionSceneView | null>(null);
  const sessionRef = useRef<AriaGatewaySession | null>(null);
  const streamerRef = useRef<BrowserPcmStreamer | null>(null);
  const ampDecayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const session = new AriaGatewaySession({
      onState: setState,
      onAmplitude: (level) => {
        setAmplitude(level);
      },
      onTranscript: (line) => {
        setLines((prev) => {
          if (prev.some((item) => item.id === line.id && item.text === line.text)) {
            return prev;
          }
          return [...prev.slice(-20), line];
        });
      },
      onConnection: setConnected,
      onError: (message) => {
        if (message.toLowerCase().includes("mic")) {
          setMicError(message);
        }
      },
      onSceneSummary: setSceneSummary,
      onSceneUpdate: setVisionScene,
    });
    sessionRef.current = session;
    session.connect();

    ampDecayRef.current = setInterval(() => {
      setAmplitude((prev) => (prev < 0.02 ? 0 : prev * 0.92));
    }, 50);

    return () => {
      session.disconnect();
      streamerRef.current?.stop();
      if (ampDecayRef.current) {
        clearInterval(ampDecayRef.current);
      }
    };
  }, []);

  const onSend = (text: string) => {
    sessionRef.current?.sendChat(text);
  };

  const onMicDown = async () => {
    if (!sessionRef.current || micActive) {
      return;
    }
    try {
      if (!streamerRef.current) {
        streamerRef.current = new BrowserPcmStreamer((pcm) => {
          sessionRef.current?.sendPcm(pcm);
        });
      }
      await streamerRef.current.start();
      sessionRef.current.setPushToTalk(true);
      setMicActive(true);
      setMicAvailable(true);
      setMicError(null);
    } catch {
      setMicAvailable(false);
      setMicError("Microphone unavailable — type instead");
      streamerRef.current?.stop();
      streamerRef.current = null;
    }
  };

  const onMicUp = () => {
    if (!micActive) {
      return;
    }
    sessionRef.current?.setPushToTalk(false);
    streamerRef.current?.stop();
    streamerRef.current = null;
    setMicActive(false);
  };

  const face = expressionFromUiState(state);

  return (
    <main className="scene">
      <div className="atmosphere" aria-hidden />
      <header className="brand">
        <h1>Aria</h1>
        <StatusLine
          state={state}
          connected={connected}
          micError={micError}
          sceneSummary={sceneSummary}
        />
      </header>

      <section className="orb-stage" aria-label="Aria presence">
        <RobotFace
          expression={face.expression}
          speaking={face.speaking}
          amplitude={amplitude}
        />
        <TranscriptStrip lines={lines} />
        <VisionPreview scene={visionScene} connected={connected} />
      </section>

      <ChatDock
        disabled={!connected}
        micActive={micActive}
        micAvailable={micAvailable}
        onSend={onSend}
        onMicDown={() => {
          void onMicDown();
        }}
        onMicUp={onMicUp}
        onClear={() => {
          sessionRef.current?.clearHistory();
          setLines([]);
        }}
      />
    </main>
  );
}

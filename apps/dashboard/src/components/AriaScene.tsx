"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserPcmStreamer } from "@/lib/browser-pcm";
import { BrowserPcmPlayer } from "@/lib/browser-pcm-player";
import { AriaGatewaySession } from "@/lib/gateway-client";
import {
  visionStreamUrl,
  type AriaUiState,
  type TranscriptLine,
  type VisionSceneView,
  type VisionStreamState,
} from "@/lib/types";
import { ChatDock } from "./ChatDock";
import { expressionFromUiState, RobotFace } from "./robot-face";
import { SettingsPanel } from "./SettingsPanel";
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
  const [videoStreaming, setVideoStreaming] = useState(false);
  const [videoAvailable, setVideoAvailable] = useState(true);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sessionRef = useRef<AriaGatewaySession | null>(null);
  const streamerRef = useRef<BrowserPcmStreamer | null>(null);
  const playerRef = useRef<BrowserPcmPlayer | null>(null);
  const ampDecayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!playerRef.current) {
    playerRef.current = new BrowserPcmPlayer();
  }

  useEffect(() => {
    const session = new AriaGatewaySession({
      onState: setState,
      onAmplitude: (level) => {
        setAmplitude(level);
      },
      onAudioStart: (sampleRateHz) => {
        playerRef.current?.start(sampleRateHz);
      },
      onAudioPcm: (pcm) => {
        playerRef.current?.enqueue(pcm);
      },
      onAudioStop: (reason) => {
        if (reason === "interrupt") {
          playerRef.current?.stop();
        }
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
    void fetch(visionStreamUrl())
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as VisionStreamState;
        setVideoAvailable(body.available);
        setVideoStreaming(body.streaming);
      })
      .catch(() => {
        // Gateway may still be coming up; Start video will retry.
      });

    ampDecayRef.current = setInterval(() => {
      setAmplitude((prev) => (prev < 0.02 ? 0 : prev * 0.92));
    }, 50);

    return () => {
      session.disconnect();
      streamerRef.current?.stop();
      playerRef.current?.stop();
      if (ampDecayRef.current) {
        clearInterval(ampDecayRef.current);
      }
    };
  }, []);

  const onSend = (text: string) => {
    playerRef.current?.unlock();
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
      playerRef.current?.unlock();
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

  const toggleVideo = async () => {
    if (videoBusy) {
      return;
    }
    setVideoBusy(true);
    setVideoError(null);
    try {
      const response = await fetch(visionStreamUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streaming: !videoStreaming }),
      });
      const body = (await response.json()) as VisionStreamState;
      if (!response.ok) {
        throw new Error(body.error ?? `Video toggle failed (${response.status})`);
      }
      setVideoAvailable(body.available);
      setVideoStreaming(body.streaming);
      if (!body.streaming) {
        setVisionScene(null);
        setSceneSummary(null);
      }
    } catch (error: unknown) {
      setVideoError(error instanceof Error ? error.message : String(error));
    } finally {
      setVideoBusy(false);
    }
  };

  const face = expressionFromUiState(state);

  return (
    <main className="scene">
      <div className="atmosphere" aria-hidden />
      <header className="brand">
        <div className="brand-row">
          <h1>Aria</h1>
          <button
            type="button"
            className="ghost settings-trigger"
            onClick={() => setSettingsOpen(true)}
            disabled={!connected}
          >
            Providers
          </button>
        </div>
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
        <VisionPreview
          scene={visionScene}
          connected={connected}
          streaming={videoStreaming}
          available={videoAvailable}
          busy={videoBusy}
          error={videoError}
          onToggle={() => {
            void toggleVideo();
          }}
        />
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

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

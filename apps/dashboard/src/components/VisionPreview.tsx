"use client";

import { useEffect, useRef } from "react";
import {
  visionFrameUrl,
  type VisionDetectedObject,
  type VisionSceneView,
} from "@/lib/types";

/** Smooth preview poll rate (capture only — not YOLO). */
const PREVIEW_POLL_MS = 120;

interface VisionPreviewProps {
  readonly scene: VisionSceneView | null;
  readonly connected: boolean;
}

export function VisionPreview({ scene, connected }: VisionPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectsRef = useRef<readonly VisionDetectedObject[]>([]);
  const sourceRef = useRef<VisionSceneView["source"]>(undefined);
  const loadTokenRef = useRef(0);
  const inFlightRef = useRef(false);

  // Keep latest boxes for overlay; detection can stay at 1000ms.
  useEffect(() => {
    if (!scene) {
      return;
    }
    objectsRef.current = scene.objects;
    sourceRef.current = scene.source;
    const cached = imageRef.current;
    if (cached?.complete && cached.naturalWidth > 0) {
      drawScene(canvasRef.current, cached, objectsRef.current, sourceRef.current);
    }
  }, [scene]);

  // Smooth live camera preview independent of analyze interval.
  useEffect(() => {
    if (!connected) {
      drawPlaceholder(canvasRef.current, "Connecting…");
      return;
    }

    let cancelled = false;

    const pullFrame = () => {
      if (cancelled || inFlightRef.current || document.hidden) {
        return;
      }
      inFlightRef.current = true;
      const token = ++loadTokenRef.current;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        inFlightRef.current = false;
        if (cancelled || token !== loadTokenRef.current) {
          return;
        }
        imageRef.current = img;
        drawScene(
          canvasRef.current,
          img,
          objectsRef.current,
          sourceRef.current,
        );
      };
      img.onerror = () => {
        inFlightRef.current = false;
        if (cancelled || token !== loadTokenRef.current) {
          return;
        }
        if (!imageRef.current) {
          drawPlaceholder(canvasRef.current, "Waiting for camera…");
        }
      };
      img.src = visionFrameUrl({ live: true, bust: Date.now() });
    };

    pullFrame();
    const timer = setInterval(pullFrame, PREVIEW_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) {
        pullFrame();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      loadTokenRef.current += 1;
      inFlightRef.current = false;
    };
  }, [connected]);

  const title = scene?.source === "mock" ? "Vision (mock)" : "Vision";

  return (
    <aside className="vision-preview" aria-label="What Aria sees">
      <div className="vision-preview-head">
        <span className="vision-preview-title">{title}</span>
        <span className="vision-preview-meta">
          {scene
            ? `${scene.objects.length} object${scene.objects.length === 1 ? "" : "s"}`
            : "—"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="vision-preview-canvas"
        width={320}
        height={180}
      />
      {scene?.summary ? (
        <p className="vision-preview-caption">{scene.summary}</p>
      ) : null}
    </aside>
  );
}

function drawPlaceholder(
  canvas: HTMLCanvasElement | null,
  message: string,
): void {
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const { width, height } = canvas;
  ctx.fillStyle = "#0a1220";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(0, 240, 255, 0.25)";
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.fillStyle = "#7aa0b4";
  ctx.font = "12px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function drawScene(
  canvas: HTMLCanvasElement | null,
  image: HTMLImageElement,
  objects: readonly VisionDetectedObject[],
  source?: "mock" | "live",
): void {
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const { width, height } = canvas;
  ctx.fillStyle = "#0a1220";
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / image.width, height / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const ox = (width - drawW) / 2;
  const oy = (height - drawH) / 2;
  ctx.drawImage(image, ox, oy, drawW, drawH);

  for (const obj of objects) {
    const x = ox + obj.bbox.x * drawW;
    const y = oy + obj.bbox.y * drawH;
    const w = obj.bbox.width * drawW;
    const h = obj.bbox.height * drawH;
    ctx.strokeStyle = source === "mock" ? "#ffb86b" : "#00f0ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    const label = `${obj.label} ${Math.round(obj.confidence * 100)}%`;
    ctx.font = "11px ui-monospace, monospace";
    const textW = ctx.measureText(label).width + 8;
    ctx.fillStyle = "rgba(8, 14, 28, 0.82)";
    ctx.fillRect(x, Math.max(0, y - 16), textW, 16);
    ctx.fillStyle = source === "mock" ? "#ffb86b" : "#80f5ff";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 4, Math.max(12, y - 4));
  }
}

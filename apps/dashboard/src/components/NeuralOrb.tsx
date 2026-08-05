"use client";

import { useEffect, useRef } from "react";
import type { AriaUiState } from "@/lib/types";

interface NeuralOrbProps {
  readonly state: AriaUiState;
  readonly amplitude: number;
}

interface Node {
  angle: number;
  radius: number;
  phase: number;
}

function stateHue(state: AriaUiState): number {
  switch (state) {
    case "listening":
      return 185;
    case "transcribing":
      return 42;
    case "thinking":
      return 28;
    case "speaking":
      return 165;
    case "error":
      return 0;
    case "idle":
    case "stopping":
      return 200;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function stateEnergy(state: AriaUiState): number {
  switch (state) {
    case "speaking":
      return 1.35;
    case "thinking":
    case "transcribing":
      return 1.1;
    case "listening":
      return 0.85;
    case "error":
      return 0.4;
    case "idle":
    case "stopping":
      return 0.55;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/**
 * Jarvis-inspired neural orb: concentric sine waves + sparse node mesh,
 * expanding and shrinking with amplitude.
 */
export function NeuralOrb({ state, amplitude }: NeuralOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const ampRef = useRef(amplitude);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    ampRef.current = amplitude;
  }, [amplitude]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const nodes: Node[] = Array.from({ length: 48 }, (_, i) => ({
      angle: (i / 48) * Math.PI * 2,
      radius: 0.35 + (i % 5) * 0.08,
      phase: (i * 0.37) % (Math.PI * 2),
    }));

    let frame = 0;
    let raf = 0;
    const start = performance.now();

    const resize = () => {
      const size = Math.min(window.innerWidth, window.innerHeight) * 0.72;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (now: number) => {
      frame += 1;
      const t = (now - start) / 1000;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const cx = cssW / 2;
      const cy = cssH / 2;
      const currentState = stateRef.current;
      const amp = Math.min(1, Math.max(0, ampRef.current));
      const energy = stateEnergy(currentState);
      const hue = stateHue(currentState);
      const breath =
        0.82 +
        amp * 0.28 * energy +
        Math.sin(t * (currentState === "thinking" ? 4.2 : 1.6)) * 0.03;
      const baseR = Math.min(cssW, cssH) * 0.28 * breath;

      ctx.clearRect(0, 0, cssW, cssH);

      const glow = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, baseR * 2.1);
      glow.addColorStop(0, `hsla(${hue}, 70%, 55%, ${0.18 + amp * 0.22})`);
      glow.addColorStop(0.45, `hsla(${hue}, 55%, 35%, 0.08)`);
      glow.addColorStop(1, "hsla(210, 30%, 8%, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, cssW, cssH);

      // Concentric Jarvis-like wave rings
      const waves = 5;
      for (let i = 0; i < waves; i += 1) {
        const ringAmp =
          (amp * 0.55 + 0.12) * ((waves - i) / waves) * energy;
        ctx.beginPath();
        const steps = 180;
        for (let s = 0; s <= steps; s += 1) {
          const angle = (s / steps) * Math.PI * 2;
          const phase =
            i * 0.9 +
            t * (1.2 + i * 0.15) * (i % 2 === 0 ? 1 : -1) +
            angle * (2 + i * 0.4);
          const wobble =
            Math.sin(phase) *
            baseR *
            ringAmp *
            Math.exp(-((s / steps - 0.5) ** 2) / 0.35);
          const r = baseR * (0.55 + i * 0.12) + wobble;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (s === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.strokeStyle = `hsla(${(hue + i * 12) % 360}, 75%, ${55 - i * 4}%, ${0.35 + amp * 0.35})`;
        ctx.lineWidth = 1.4 + amp * 1.2;
        ctx.stroke();
      }

      // Neural mesh
      const points = nodes.map((node) => {
        const pulse =
          Math.sin(t * 2.4 + node.phase) * 0.04 + amp * 0.08 * energy;
        const r = baseR * (node.radius + pulse);
        return {
          x: cx + Math.cos(node.angle + t * 0.15) * r,
          y: cy + Math.sin(node.angle + t * 0.15) * r,
        };
      });

      ctx.lineWidth = 0.8;
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i]!;
          const b = points[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < baseR * 0.55) {
            const alpha = (1 - dist / (baseR * 0.55)) * (0.12 + amp * 0.25);
            ctx.strokeStyle = `hsla(${hue}, 80%, 70%, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.6 + amp * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 90%, 78%, ${0.55 + amp * 0.35})`;
        ctx.fill();
      }

      // Core
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.42);
      core.addColorStop(0, `hsla(${hue}, 90%, 85%, ${0.85 + amp * 0.15})`);
      core.addColorStop(0.4, `hsla(${hue}, 70%, 55%, 0.45)`);
      core.addColorStop(1, `hsla(${hue}, 60%, 30%, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();

      // Vertical waveform bars through center (Jarvis echo)
      const barCount = 64;
      ctx.strokeStyle = `hsla(${hue}, 85%, 70%, ${0.25 + amp * 0.45})`;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < barCount; i += 1) {
        const xNorm = i / (barCount - 1);
        const x = cx - baseR * 0.75 + xNorm * baseR * 1.5;
        const gauss = Math.exp(-((xNorm - 0.5) ** 2) / 0.08);
        const wave =
          Math.sin(t * 6 + i * 0.35) *
          amp *
          energy *
          baseR *
          0.35 *
          gauss;
        const idle =
          Math.sin(t * 2 + i * 0.2) * baseR * 0.04 * gauss * energy;
        const y = Math.abs(wave) + Math.abs(idle);
        ctx.beginPath();
        ctx.moveTo(x, cy - y);
        ctx.lineTo(x, cy + y);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
      void frame;
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none mx-auto block max-w-[min(72vw,72vh)]"
    />
  );
}

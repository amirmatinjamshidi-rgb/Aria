"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  EXPRESSION_POSES,
  type EyeShape,
  type FaceExpression,
  type MouthShape,
} from "./expressions";

export interface RobotFaceProps {
  readonly expression?: FaceExpression;
  readonly speaking?: boolean;
  /** Optional voice amplitude (0–1) to intensify the speaking mouth pulse. */
  readonly amplitude?: number;
  readonly className?: string;
}

interface Gaze {
  readonly x: number;
  readonly y: number;
}

const SPRING_MS = 320;
const BLINK_MIN_MS = 3000;
const BLINK_MAX_MS = 6000;
const SACCADE_MIN_MS = 1800;
const SACCADE_MAX_MS = 4200;

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function mouthPath(mouth: MouthShape, speaking: boolean, pulse: number): string {
  const cx = 160;
  const cy = 178;
  const half = 34;

  if (speaking || mouth.kind === "wave") {
    const amp = 4 + pulse * 14;
    const pts: string[] = [];
    const steps = 12;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = cx - half + t * half * 2;
      const wave =
        Math.sin(t * Math.PI * 3 + pulse * 8) * amp * Math.sin(t * Math.PI);
      const cmd = i === 0 ? "M" : "L";
      pts.push(`${cmd} ${x.toFixed(1)} ${(cy + wave).toFixed(1)}`);
    }
    return pts.join(" ");
  }

  switch (mouth.kind) {
    case "smile": {
      const c = mouth.curve;
      return `M ${cx - half} ${cy - 2} Q ${cx} ${cy + c} ${cx + half} ${cy - 2}`;
    }
    case "frown": {
      const c = mouth.curve;
      return `M ${cx - half} ${cy + 6} Q ${cx} ${cy - c} ${cx + half} ${cy + 6}`;
    }
    case "o": {
      const r = 9 + mouth.open * 7;
      return [
        `M ${cx} ${cy - r}`,
        `A ${r * 0.8} ${r} 0 1 1 ${cx} ${cy + r}`,
        `A ${r * 0.8} ${r} 0 1 1 ${cx} ${cy - r}`,
        "Z",
      ].join(" ");
    }
    case "line":
      return `M ${cx - half} ${cy} Q ${cx} ${cy + mouth.curve} ${cx + half} ${cy}`;
    case "segmented":
      return `M ${cx - half} ${cy} L ${cx + half} ${cy}`;
    default: {
      const _exhaustive: never = mouth.kind;
      return _exhaustive;
    }
  }
}

function EyeGlyph({
  cx,
  cy,
  shape,
  gaze,
  blink,
  uid,
}: {
  readonly cx: number;
  readonly cy: number;
  readonly shape: EyeShape;
  readonly gaze: Gaze;
  readonly blink: number;
  readonly uid: string;
}) {
  const apertureY = Math.max(0.06, shape.scaleY * (1 - blink * 0.94));
  const shiftX = gaze.x * 10;
  const shiftY = gaze.y * 6;

  if (shape.style === "dead") {
    const arm = 16;
    return (
      <g className="rf-eye rf-eye--dead">
        <line
          x1={cx - arm}
          y1={cy - arm * 0.85}
          x2={cx + arm}
          y2={cy + arm * 0.85}
          className="rf-dead-stroke"
        />
        <line
          x1={cx + arm}
          y1={cy - arm * 0.85}
          x2={cx - arm}
          y2={cy + arm * 0.85}
          className="rf-dead-stroke"
        />
      </g>
    );
  }

  if (shape.style === "curved") {
    const rx = 26 * shape.scaleX;
    return (
      <g
        className="rf-eye"
        style={
          {
            transformOrigin: `${cx}px ${cy}px`,
            transform: `translate(${shiftX}px, ${shiftY}px) scale(${shape.scaleX}, ${apertureY})`,
            transition: `transform ${SPRING_MS}ms cubic-bezier(0.34, 1.4, 0.64, 1)`,
          } as CSSProperties
        }
      >
        <path
          d={`M ${cx - rx} ${cy + 4} Q ${cx} ${cy - 18} ${cx + rx} ${cy + 4}`}
          className="rf-eye-stroke"
          filter={`url(#${uid}-bloom)`}
        />
        <path
          d={`M ${cx - rx * 0.72} ${cy + 2} Q ${cx} ${cy - 10} ${cx + rx * 0.72} ${cy + 2}`}
          className="rf-eye-stroke rf-eye-stroke--soft"
        />
      </g>
    );
  }

  if (shape.style === "segmented") {
    const bars = 4;
    return (
      <g
        className="rf-eye"
        style={
          {
            transformOrigin: `${cx}px ${cy}px`,
            transform: `translate(${shiftX}px, ${shiftY}px) scale(${shape.scaleX}, ${apertureY})`,
            transition: `transform ${SPRING_MS}ms cubic-bezier(0.34, 1.4, 0.64, 1)`,
          } as CSSProperties
        }
      >
        <ellipse
          cx={cx}
          cy={cy}
          rx={28}
          ry={20}
          className="rf-eye-bloom"
          filter={`url(#${uid}-bloom)`}
        />
        {Array.from({ length: bars }, (_, i) => {
          const h = 3.2;
          const gap = 4.2;
          const total = bars * h + (bars - 1) * gap;
          const y = cy - total / 2 + i * (h + gap);
          const w = 18 + (i % 2) * 8;
          return (
            <rect
              key={i}
              x={cx - w / 2}
              y={y}
              width={w}
              height={h}
              rx={1.5}
              className="rf-eye-segment"
            />
          );
        })}
      </g>
    );
  }

  const ry = shape.style === "squint" ? 10 : 18;
  const rx = shape.style === "squint" ? 30 : 26;

  return (
    <g className="rf-eye">
      <g
        style={
          {
            transformOrigin: `${cx}px ${cy}px`,
            transform: `translate(${shiftX}px, ${shiftY}px) scale(${shape.scaleX}, ${apertureY})`,
            transition: `transform ${SPRING_MS}ms cubic-bezier(0.34, 1.4, 0.64, 1)`,
          } as CSSProperties
        }
      >
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx + 6}
          ry={ry + 5}
          className="rf-eye-bloom"
          filter={`url(#${uid}-bloom)`}
        />
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          className="rf-eye-lens"
          fill={`url(#${uid}-lens)`}
          filter={`url(#${uid}-core)`}
        />
        <ellipse
          cx={cx - rx * 0.28}
          cy={cy - ry * 0.35}
          rx={rx * 0.22}
          ry={ry * 0.28}
          className="rf-eye-spec"
        />
      </g>
    </g>
  );
}

function BrowBar({
  cx,
  cy,
  rotate,
  translateY,
  innerTilt,
  side,
}: {
  readonly cx: number;
  readonly cy: number;
  readonly rotate: number;
  readonly translateY: number;
  readonly innerTilt: number;
  readonly side: "left" | "right";
}) {
  const dir = side === "left" ? 1 : -1;
  const x1 = cx - 24 * dir;
  const x2 = cx + 24 * dir;
  const y1 = cy + innerTilt * 0.12;
  const y2 = cy - innerTilt * 0.4;

  return (
    <g
      style={
        {
          transformOrigin: `${cx}px ${cy}px`,
          transform: `translateY(${translateY}px) rotate(${rotate}deg)`,
          transition: `transform ${SPRING_MS}ms cubic-bezier(0.34, 1.4, 0.64, 1)`,
        } as CSSProperties
      }
    >
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="rf-brow" />
    </g>
  );
}

function SegmentedMouth({ pulse }: { readonly pulse: number }) {
  const cx = 160;
  const cy = 178;
  const widths = [10, 16, 22, 16, 10];
  let x = cx - widths.reduce((a, b) => a + b, 0) / 2 - (widths.length - 1) * 2;
  return (
    <g className="rf-mouth-segments">
      {widths.map((w, i) => {
        const h = 3.5 + Math.abs(Math.sin(pulse * 6 + i)) * 2;
        const el = (
          <rect
            key={i}
            x={x}
            y={cy - h / 2}
            width={w}
            height={h}
            rx={1.5}
            className="rf-mouth-seg"
          />
        );
        x += w + 4;
        return el;
      })}
    </g>
  );
}

/**
 * EVE / M-O inspired robot face — glossy white chassis, dark matte screen,
 * cyan digital features. Supports expression presets, speaking waveform, blink,
 * saccades, and gaze tracking.
 */
export function RobotFace({
  expression = "neutral",
  speaking = false,
  amplitude = 0,
  className,
}: RobotFaceProps) {
  const uid = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const pose = EXPRESSION_POSES[expression];
  const ampRef = useRef(amplitude);

  const [blink, setBlink] = useState(0);
  const [gaze, setGaze] = useState<Gaze>({ x: 0, y: 0 });
  const [saccade, setSaccade] = useState<Gaze>({ x: 0, y: 0 });
  const [pulse, setPulse] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pointerGaze = useRef<Gaze>({ x: 0, y: 0 });

  useEffect(() => {
    ampRef.current = amplitude;
  }, [amplitude]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion || pose.leftEye.style === "dead") {
      setBlink(0);
      return;
    }
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    let animFrame = 0;

    const schedule = () => {
      timeout = setTimeout(() => {
        if (cancelled) {
          return;
        }
        const start = performance.now();
        const duration = 140;
        const tick = (now: number) => {
          if (cancelled) {
            return;
          }
          const t = Math.min(1, (now - start) / duration);
          const amount = t < 0.5 ? t * 2 : (1 - t) * 2;
          setBlink(amount);
          if (t < 1) {
            animFrame = requestAnimationFrame(tick);
          } else {
            setBlink(0);
            schedule();
          }
        };
        animFrame = requestAnimationFrame(tick);
      }, randBetween(BLINK_MIN_MS, BLINK_MAX_MS));
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      cancelAnimationFrame(animFrame);
    };
  }, [reducedMotion, pose.leftEye.style, expression]);

  useEffect(() => {
    if (reducedMotion) {
      setSaccade({ x: 0, y: 0 });
      return;
    }
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        if (cancelled) {
          return;
        }
        setSaccade({
          x: randBetween(-0.4, 0.4),
          y: randBetween(-0.28, 0.28),
        });
        schedule();
      }, randBetween(SACCADE_MIN_MS, SACCADE_MAX_MS));
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      setPulse(speaking ? 0.45 : 0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      if (speaking) {
        const ampBoost = Math.min(1, Math.max(0, ampRef.current)) * 0.4;
        const wave =
          0.3 +
          ampBoost +
          Math.abs(Math.sin(t * 10)) * 0.4 +
          Math.abs(Math.sin(t * 15.5 + 1.1)) * 0.25;
        setPulse(Math.min(1, wave));
      } else if (expression === "thinking") {
        setPulse(0.35 + Math.sin(t * 2.8) * 0.2);
      } else {
        setPulse(0.06 + Math.sin(t * 1.35) * 0.035);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking, reducedMotion, expression]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const px = pointerGaze.current.x;
      const py = pointerGaze.current.y;
      setGaze({
        x: Math.max(-1, Math.min(1, px * 0.8 + saccade.x)),
        y: Math.max(-1, Math.min(1, py * 0.8 + saccade.y)),
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [saccade]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    pointerGaze.current = {
      x: Math.max(-1, Math.min(1, nx)),
      y: Math.max(-1, Math.min(1, ny)),
    };
  }, []);

  const onPointerLeave = useCallback(() => {
    pointerGaze.current = { x: 0, y: 0 };
  }, []);

  const effectiveMouth = useMemo((): MouthShape => {
    if (speaking) {
      return { kind: "wave", curve: 0, open: 1 };
    }
    return pose.mouth;
  }, [speaking, pose.mouth]);

  const path = mouthPath(effectiveMouth, speaking, pulse);
  const breath = reducedMotion ? 1 : 1 + pulse * 0.01;
  const glow = pose.glowIntensity * (speaking ? 1.12 : 1);
  const showSegmentedMouth = !speaking && effectiveMouth.kind === "segmented";
  const mouthFilled = speaking || effectiveMouth.kind === "o";

  return (
    <div
      ref={rootRef}
      className={`robot-face ${className ?? ""}`.trim()}
      role="img"
      aria-label={`Aria face, ${expression}${speaking ? ", speaking" : ""}`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={
        {
          "--rf-glow": String(glow),
          transform: `scale(${breath})`,
        } as CSSProperties
      }
    >
      <svg
        className="robot-face__svg"
        viewBox="0 0 320 300"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id={`${uid}-shell`} x1="18%" y1="0%" x2="82%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="38%" stopColor="#f4f7fb" />
            <stop offset="72%" stopColor="#e4ebf4" />
            <stop offset="100%" stopColor="#cfd8e6" />
          </linearGradient>
          <linearGradient id={`${uid}-shell-shine`} x1="30%" y1="0%" x2="70%" y2="55%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <radialGradient id={`${uid}-screen`} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#152038" />
            <stop offset="55%" stopColor="#0a101c" />
            <stop offset="100%" stopColor="#05080f" />
          </radialGradient>
          <linearGradient id={`${uid}-lens`} x1="30%" y1="15%" x2="70%" y2="90%">
            <stop offset="0%" stopColor="#80F5FF" />
            <stop offset="45%" stopColor="#00F0FF" />
            <stop offset="100%" stopColor="#0066FF" />
          </linearGradient>
          <filter id={`${uid}-bloom`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`${uid}-core`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
          <clipPath id={`${uid}-screen-clip`}>
            <ellipse cx="160" cy="142" rx="92" ry="78" />
          </clipPath>
        </defs>

        <ellipse cx="160" cy="278" rx="78" ry="10" className="rf-ground-shadow" />

        <ellipse
          cx="160"
          cy="148"
          rx="118"
          ry="128"
          fill={`url(#${uid}-shell)`}
          className="rf-chassis"
          filter={`url(#${uid}-soft)`}
        />
        <ellipse
          cx="128"
          cy="88"
          rx="52"
          ry="36"
          fill={`url(#${uid}-shell-shine)`}
          className="rf-chassis-shine"
        />
        <ellipse
          cx="160"
          cy="230"
          rx="70"
          ry="28"
          fill="rgba(160, 176, 198, 0.28)"
          className="rf-chassis-bevel"
        />

        <ellipse
          cx="160"
          cy="142"
          rx="92"
          ry="78"
          fill={`url(#${uid}-screen)`}
          className="rf-screen"
        />
        <ellipse
          cx="160"
          cy="142"
          rx="92"
          ry="78"
          fill="none"
          className="rf-screen-rim"
        />

        <g clipPath={`url(#${uid}-screen-clip)`}>
          <ellipse cx="160" cy="118" rx="70" ry="28" className="rf-screen-sheen" />

          <BrowBar
            side="left"
            cx={108}
            cy={88}
            rotate={pose.leftBrow.rotate}
            translateY={pose.leftBrow.translateY}
            innerTilt={pose.leftBrow.innerTilt}
          />
          <BrowBar
            side="right"
            cx={212}
            cy={88}
            rotate={pose.rightBrow.rotate}
            translateY={pose.rightBrow.translateY}
            innerTilt={pose.rightBrow.innerTilt}
          />

          <EyeGlyph
            cx={108}
            cy={128}
            shape={pose.leftEye}
            gaze={gaze}
            blink={blink}
            uid={uid}
          />
          <EyeGlyph
            cx={212}
            cy={128}
            shape={pose.rightEye}
            gaze={gaze}
            blink={blink}
            uid={uid}
          />

          {showSegmentedMouth ? (
            <SegmentedMouth pulse={pulse} />
          ) : (
            <path
              d={path}
              className={
                mouthFilled ? "rf-mouth rf-mouth--fill" : "rf-mouth rf-mouth--stroke"
              }
              filter={`url(#${uid}-bloom)`}
              style={{
                transition: `d ${SPRING_MS}ms cubic-bezier(0.34, 1.4, 0.64, 1)`,
              }}
            />
          )}
        </g>
      </svg>
    </div>
  );
}

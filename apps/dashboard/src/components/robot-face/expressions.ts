export type FaceExpression =
  | "neutral"
  | "happy"
  | "listening"
  | "thinking"
  | "surprised"
  | "angry"
  | "error";

/** Digital eye glyph style on the matte face screen. */
export type EyeStyle = "oval" | "curved" | "squint" | "segmented" | "dead";

export interface EyeShape {
  readonly style: EyeStyle;
  /** Vertical scale of the eye aperture (1 = open). */
  readonly scaleY: number;
  /** Horizontal scale of the eye aperture. */
  readonly scaleX: number;
}

export interface BrowShape {
  /** Rotation in degrees. */
  readonly rotate: number;
  /** Vertical offset in SVG units. */
  readonly translateY: number;
  /** Inner tip lift (negative = raised toward center). */
  readonly innerTilt: number;
}

export interface MouthShape {
  readonly kind: "line" | "smile" | "frown" | "o" | "wave" | "segmented";
  /** Smile/frown curve depth in SVG units. */
  readonly curve: number;
  /** Openness for O / talking. */
  readonly open: number;
}

export interface ExpressionPose {
  readonly leftEye: EyeShape;
  readonly rightEye: EyeShape;
  readonly leftBrow: BrowShape;
  readonly rightBrow: BrowShape;
  readonly mouth: MouthShape;
  readonly glowIntensity: number;
}

const eye = (
  style: EyeStyle,
  scaleY = 1,
  scaleX = 1,
): EyeShape => ({ style, scaleY, scaleX });

export const EXPRESSION_POSES: Record<FaceExpression, ExpressionPose> = {
  neutral: {
    leftEye: eye("oval", 1, 1),
    rightEye: eye("oval", 1, 1),
    leftBrow: { rotate: 0, translateY: 0, innerTilt: 0 },
    rightBrow: { rotate: 0, translateY: 0, innerTilt: 0 },
    mouth: { kind: "line", curve: 0, open: 0 },
    glowIntensity: 0.9,
  },
  happy: {
    leftEye: eye("curved", 1, 1.12),
    rightEye: eye("curved", 1, 1.12),
    leftBrow: { rotate: -10, translateY: -6, innerTilt: -8 },
    rightBrow: { rotate: 10, translateY: -6, innerTilt: -8 },
    mouth: { kind: "smile", curve: 16, open: 0 },
    glowIntensity: 1.15,
  },
  listening: {
    leftEye: eye("oval", 1.12, 1.08),
    rightEye: eye("oval", 1.12, 1.08),
    leftBrow: { rotate: 6, translateY: -2, innerTilt: 5 },
    rightBrow: { rotate: -6, translateY: -2, innerTilt: 5 },
    mouth: { kind: "line", curve: 3, open: 0 },
    glowIntensity: 1.05,
  },
  thinking: {
    leftEye: eye("segmented", 0.85, 1.05),
    rightEye: eye("segmented", 0.95, 1.05),
    leftBrow: { rotate: 14, translateY: 2, innerTilt: 12 },
    rightBrow: { rotate: -6, translateY: -8, innerTilt: -10 },
    mouth: { kind: "segmented", curve: 0, open: 0 },
    glowIntensity: 0.8,
  },
  surprised: {
    leftEye: eye("oval", 1.4, 1.18),
    rightEye: eye("oval", 1.4, 1.18),
    leftBrow: { rotate: -16, translateY: -12, innerTilt: -14 },
    rightBrow: { rotate: 16, translateY: -12, innerTilt: -14 },
    mouth: { kind: "o", curve: 0, open: 1 },
    glowIntensity: 1.3,
  },
  angry: {
    leftEye: eye("squint", 0.7, 1.12),
    rightEye: eye("squint", 0.7, 1.12),
    leftBrow: { rotate: 20, translateY: 4, innerTilt: 18 },
    rightBrow: { rotate: -20, translateY: 4, innerTilt: 18 },
    mouth: { kind: "frown", curve: 12, open: 0 },
    glowIntensity: 1.2,
  },
  error: {
    leftEye: eye("dead", 1, 1),
    rightEye: eye("dead", 1, 1),
    leftBrow: { rotate: 10, translateY: 2, innerTilt: 8 },
    rightBrow: { rotate: -10, translateY: 2, innerTilt: 8 },
    mouth: { kind: "frown", curve: 8, open: 0 },
    glowIntensity: 0.5,
  },
};

/** Map Aria voice pipeline states onto face expression presets. */
export function expressionFromUiState(
  state: string,
): { expression: FaceExpression; speaking: boolean } {
  switch (state) {
    case "listening":
      return { expression: "listening", speaking: false };
    case "transcribing":
    case "thinking":
      return { expression: "thinking", speaking: false };
    case "speaking":
      return { expression: "happy", speaking: true };
    case "error":
      return { expression: "error", speaking: false };
    case "idle":
    case "stopping":
      return { expression: "neutral", speaking: false };
    default:
      return { expression: "neutral", speaking: false };
  }
}

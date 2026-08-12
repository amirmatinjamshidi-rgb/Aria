import type { BoundingBox, DetectedObject } from "@aria/contracts";

function iou(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) {
    return 0;
  }
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Assigns stable trackIds across frames via IoU + label matching.
 * Used when the backend (e.g. Gemini) does not run ByteTrack.
 */
export class SimpleIouTracker {
  private nextId = 1;
  private previous: DetectedObject[] = [];

  assign(
    detections: readonly DetectedObject[],
    threshold = 0.3,
  ): DetectedObject[] {
    const usedPrev = new Set<number>();
    const assigned: DetectedObject[] = [];

    for (const det of detections) {
      let bestIdx = -1;
      let bestScore = threshold;
      for (let i = 0; i < this.previous.length; i += 1) {
        if (usedPrev.has(i)) {
          continue;
        }
        const prev = this.previous[i]!;
        if (prev.label !== det.label) {
          continue;
        }
        const score = iou(prev.bbox, det.bbox);
        if (score >= bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        usedPrev.add(bestIdx);
        assigned.push({
          ...det,
          trackId: this.previous[bestIdx]!.trackId ?? `track-${this.nextId++}`,
        });
      } else {
        assigned.push({
          ...det,
          trackId: `track-${this.nextId++}`,
        });
      }
    }

    this.previous = assigned;
    return assigned;
  }

  reset(): void {
    this.previous = [];
    this.nextId = 1;
  }
}

import { describe, expect, it } from "vitest";
import { SimpleIouTracker } from "./iou-tracker.js";

describe("SimpleIouTracker", () => {
  it("reuses trackId for overlapping same-label boxes", () => {
    const tracker = new SimpleIouTracker();
    const a = tracker.assign([
      {
        id: "1",
        label: "cell phone",
        confidence: 0.9,
        bbox: { x: 0.2, y: 0.2, width: 0.2, height: 0.3 },
      },
    ]);
    const b = tracker.assign([
      {
        id: "2",
        label: "cell phone",
        confidence: 0.88,
        bbox: { x: 0.22, y: 0.21, width: 0.2, height: 0.3 },
      },
    ]);
    expect(a[0]?.trackId).toBeDefined();
    expect(b[0]?.trackId).toBe(a[0]?.trackId);
  });

  it("allocates a new track when labels differ", () => {
    const tracker = new SimpleIouTracker();
    const a = tracker.assign([
      {
        id: "1",
        label: "cup",
        confidence: 0.9,
        bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      },
    ]);
    const b = tracker.assign([
      {
        id: "2",
        label: "person",
        confidence: 0.9,
        bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      },
    ]);
    expect(a[0]?.trackId).not.toBe(b[0]?.trackId);
  });
});

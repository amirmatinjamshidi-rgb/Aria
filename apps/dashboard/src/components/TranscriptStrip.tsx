"use client";

import type { TranscriptLine } from "@/lib/types";

interface TranscriptStripProps {
  readonly lines: readonly TranscriptLine[];
}

export function TranscriptStrip({ lines }: TranscriptStripProps) {
  const recent = lines.slice(-2);
  if (recent.length === 0) {
    return <div className="transcript empty">Say something, or type below</div>;
  }
  return (
    <div className="transcript">
      {recent.map((line) => (
        <p key={line.id} className={line.role}>
          <span className="role">{line.role === "user" ? "You" : "Aria"}</span>
          {line.text}
        </p>
      ))}
    </div>
  );
}

"use client";

import { statusLabel, type AriaUiState } from "@/lib/types";

interface StatusLineProps {
  readonly state: AriaUiState;
  readonly connected: boolean;
  readonly micError?: string | null;
  readonly sceneSummary?: string | null;
}

export function StatusLine({
  state,
  connected,
  micError,
  sceneSummary,
}: StatusLineProps) {
  return (
    <p className="status-line">
      <span className={connected ? "dot live" : "dot"} />
      <span>{connected ? statusLabel(state) : "Connecting to Aria…"}</span>
      {sceneSummary ? <span className="scene-hint">Scene: {sceneSummary}</span> : null}
      {micError ? <span className="mic-hint">{micError}</span> : null}
    </p>
  );
}

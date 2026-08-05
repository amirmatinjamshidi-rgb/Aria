"use client";

import { statusLabel, type AriaUiState } from "@/lib/types";

interface StatusLineProps {
  readonly state: AriaUiState;
  readonly connected: boolean;
  readonly micError?: string | null;
}

export function StatusLine({ state, connected, micError }: StatusLineProps) {
  return (
    <p className="status-line">
      <span className={connected ? "dot live" : "dot"} />
      <span>{connected ? statusLabel(state) : "Connecting to Aria…"}</span>
      {micError ? <span className="mic-hint">{micError}</span> : null}
    </p>
  );
}

"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

interface ChatDockProps {
  readonly disabled?: boolean;
  readonly micActive: boolean;
  readonly micAvailable: boolean;
  readonly onSend: (text: string) => void;
  readonly onMicDown: () => void;
  readonly onMicUp: () => void;
  readonly onClear: () => void;
}

export function ChatDock({
  disabled,
  micActive,
  micAvailable,
  onSend,
  onMicDown,
  onMicUp,
  onClear,
}: ChatDockProps) {
  const [text, setText] = useState("");

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if (!value) {
      return;
    }
    onSend(value);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className="chat-dock" onSubmit={submit}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type when the microphone isn’t available…"
        rows={2}
        disabled={disabled}
        aria-label="Message Aria"
      />
      <div className="dock-actions">
        <button
          type="button"
          className={`mic ${micActive ? "active" : ""}`}
          disabled={disabled || !micAvailable}
          onPointerDown={(event) => {
            event.preventDefault();
            onMicDown();
          }}
          onPointerUp={onMicUp}
          onPointerLeave={onMicUp}
          onPointerCancel={onMicUp}
          title={
            micAvailable
              ? "Hold to talk"
              : "Microphone unavailable — use text input"
          }
        >
          Mic
        </button>
        <button type="button" className="ghost" onClick={onClear} disabled={disabled}>
          Clear
        </button>
        <button type="submit" className="send" disabled={disabled || !text.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}

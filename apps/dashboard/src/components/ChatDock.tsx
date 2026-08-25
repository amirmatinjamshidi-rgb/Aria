"use client";

import { useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";

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

  const onMicPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    // Capture so small pointer moves off the button do not end the utterance.
    event.currentTarget.setPointerCapture(event.pointerId);
    onMicDown();
  };

  const onMicPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onMicUp();
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
          onPointerDown={onMicPointerDown}
          onPointerUp={onMicPointerUp}
          onPointerCancel={onMicPointerUp}
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

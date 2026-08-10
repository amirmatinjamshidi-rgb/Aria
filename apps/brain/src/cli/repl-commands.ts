import type { LanguageCode } from "@aria/contracts";

export type ReplLanguageMode = LanguageCode | "auto";

export type ReplCommand =
  | { readonly kind: "empty" }
  | { readonly kind: "exit" }
  | { readonly kind: "help" }
  | { readonly kind: "clear" }
  | { readonly kind: "metrics" }
  | { readonly kind: "lang"; readonly mode: ReplLanguageMode }
  | { readonly kind: "chat"; readonly text: string };

const HAS_PERSIAN = /[\u0600-\u06FF]/;

/**
 * Detect utterance language. Explicit mode wins over script heuristics.
 */
export function detectLanguage(
  text: string,
  mode: ReplLanguageMode = "auto",
): LanguageCode {
  if (mode === "en" || mode === "fa") {
    return mode;
  }
  return HAS_PERSIAN.test(text) ? "fa" : "en";
}

/**
 * Parse a single REPL line into a command.
 * Slash commands are reserved; everything else is chat text.
 */
export function parseReplLine(line: string): ReplCommand {
  const trimmed = line.trim();
  if (!trimmed) {
    return { kind: "empty" };
  }

  const lower = trimmed.toLowerCase();
  if (
    lower === "/exit" ||
    lower === "/quit" ||
    lower === "exit" ||
    lower === "quit"
  ) {
    return { kind: "exit" };
  }
  if (lower === "/help" || lower === "help") {
    return { kind: "help" };
  }
  if (lower === "/clear") {
    return { kind: "clear" };
  }
  if (lower === "/metrics") {
    return { kind: "metrics" };
  }

  if (lower.startsWith("/lang")) {
    const parts = trimmed.split(/\s+/);
    const value = (parts[1] ?? "").toLowerCase();
    if (value === "en" || value === "fa" || value === "auto") {
      return { kind: "lang", mode: value };
    }
    return { kind: "help" };
  }

  return { kind: "chat", text: trimmed };
}

export const REPL_HELP_ROWS = [
  { command: "/help", description: "Show this help" },
  { command: "/exit | /quit", description: "Leave the chat" },
  { command: "/clear", description: "Clear conversation history" },
  { command: "/lang en|fa|auto", description: "Force reply language" },
  { command: "/metrics", description: "Show turn latency summary" },
] as const;

/** @deprecated Prefer REPL_HELP_ROWS for styled output */
export const REPL_HELP_LINES = [
  "Interactive Aria brain REPL",
  "",
  "Commands:",
  ...REPL_HELP_ROWS.map(
    (row) => `  ${row.command.padEnd(18, " ")} ${row.description}`,
  ),
  "",
  "Anything else is sent to Aria as a user utterance.",
] as const;

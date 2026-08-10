import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
  type IMessageBus,
  type ToolCallCompletedEvent,
} from "@aria/contracts";
import type { ConversationService } from "../services/conversation-service.js";
import { cli } from "./logger.js";
import {
  REPL_HELP_ROWS,
  detectLanguage,
  parseReplLine,
  type ReplLanguageMode,
} from "./repl-commands.js";

export interface ReplSessionOptions {
  readonly bus: IMessageBus;
  readonly conversation: ConversationService;
  readonly providerLabel: string;
  readonly modelLabel?: string;
  /** Injected for tests — defaults to stdin/stdout readline */
  readonly ask?: (prompt: string) => Promise<string>;
  readonly onExit?: () => void | Promise<void>;
}

/**
 * Interactive multi-turn chat loop over the message bus.
 * Presentation-only — domain logic stays in ConversationService.
 */
export async function runReplSession(
  options: ReplSessionOptions,
): Promise<void> {
  let languageMode: ReplLanguageMode = "auto";
  let turn = 0;
  let closed = false;

  const rl =
    options.ask === undefined
      ? createInterface({ input, output, terminal: true })
      : undefined;

  const ask =
    options.ask ??
    (async (prompt: string) => {
      const answer = await rl!.question(prompt);
      return answer;
    });

  const unsubTools = options.bus.subscribe(
    AriaEventType.ConversationToolCallCompleted,
    (event) => {
      const completed = event as ToolCallCompletedEvent;
      cli.tool(completed.result.name, completed.result.ok);
    },
  );

  cli.banner("interactive brain REPL");

  const sessionRows: Array<readonly [string, string]> = [
    ["Provider", options.providerLabel],
    ["Language", languageMode],
    ["Hint", "type /help · /exit to leave"],
  ];
  if (options.modelLabel) {
    sessionRows.splice(1, 0, ["Model", options.modelLabel]);
  }
  cli.box("Session", cli.kv(sessionRows));
  cli.box("Commands", cli.helpLines([...REPL_HELP_ROWS]), "help");

  try {
    while (!closed) {
      let raw: string;
      try {
        raw = await ask(cli.prompt(languageMode));
      } catch {
        closed = true;
        break;
      }

      const command = parseReplLine(raw);

      switch (command.kind) {
        case "empty":
          break;
        case "exit":
          closed = true;
          break;
        case "help":
          cli.box("Commands", cli.helpLines([...REPL_HELP_ROWS]), "help");
          break;
        case "clear":
          options.conversation.clearHistory();
          cli.success("Conversation history cleared");
          break;
        case "metrics": {
          const summary = options.conversation.getMetrics().summary();
          cli.box(
            "Turn metrics",
            cli.kv([
              ["Turns", String(summary.turns)],
              ["Avg total", `${summary.avgTotalMs.toFixed(1)} ms`],
              ["P95 total", `${summary.p95TotalMs.toFixed(1)} ms`],
              ["Avg LLM", `${summary.avgLlmMs.toFixed(1)} ms`],
              ["Avg tool", `${summary.avgToolMs.toFixed(1)} ms`],
              ["Avg memory", `${summary.avgMemoryMs.toFixed(1)} ms`],
            ]),
            "metrics",
          );
          break;
        }
        case "lang":
          languageMode = command.mode;
          cli.success(`Language mode → ${languageMode}`);
          break;
        case "chat": {
          turn += 1;
          const language = detectLanguage(command.text, languageMode);
          const correlationId = `repl-${turn}`;
          cli.user(command.text, language);

          const replyPromise = waitForReply(options.bus, correlationId);
          const spin = cli.spinner("Aria is thinking…");
          try {
            await options.bus.publish(
              createUserUtterance(command.text, language, correlationId),
            );
            const reply = await replyPromise;
            spin.stop();
            cli.assistant(reply.text, reply.language);
          } catch (error: unknown) {
            spin.fail("Turn failed");
            const message =
              error instanceof Error ? error.message : String(error);
            cli.error(message);
          }
          break;
        }
        default: {
          const _exhaustive: never = command;
          void _exhaustive;
          break;
        }
      }
    }
  } finally {
    unsubTools();
    rl?.close();
    await options.onExit?.();
  }

  cli.goodbye();
}

function waitForReply(
  bus: IMessageBus,
  correlationId: string,
): Promise<AssistantReplyEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub();
      reject(new Error(`Timed out waiting for reply (${correlationId})`));
    }, 180_000);

    const unsub = bus.subscribe(
      AriaEventType.ConversationAssistantReply,
      (event) => {
        const reply = event as AssistantReplyEvent;
        if (reply.correlationId !== correlationId) {
          return;
        }
        clearTimeout(timeout);
        unsub();
        resolve(reply);
      },
    );
  });
}

import { describe, expect, it } from "vitest";
import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
} from "@aria/contracts";
import { createBrainContainer, resolveBrainPorts } from "../src/composition-root.js";
import { runReplSession } from "../src/cli/repl-session.js";

describe("REPL session integration (mock)", () => {
  it("handles chat, metrics, clear, and exit via injected ask()", async () => {
    const { container, conversation } = await createBrainContainer({
      ARIA_LLM_PROVIDER: "mock",
      ARIA_LOG_LEVEL: "error",
    });
    const { bus, llm } = resolveBrainPorts(container);
    const stop = conversation.start();

    const inputs = [
      "Hello Aria, who are you?",
      "/metrics",
      "/clear",
      "/lang fa",
      "سلام",
      "/exit",
    ];
    let index = 0;

    const replies: string[] = [];
    bus.subscribe(AriaEventType.ConversationAssistantReply, (event) => {
      replies.push((event as AssistantReplyEvent).text);
    });

    await runReplSession({
      bus,
      conversation,
      providerLabel: llm.metadata.id,
      ask: async () => {
        const next = inputs[index] ?? "/exit";
        index += 1;
        return next;
      },
      onExit: async () => {
        stop();
        await bus.dispose?.();
      },
    });

    expect(replies.length).toBeGreaterThanOrEqual(2);
    expect(replies[0]).toMatch(/Aria/i);
    // After /clear, history is empty but new turns still work
    expect(conversation.getHistory().some((m) => m.role === "user")).toBe(true);
  });

  it("still publishes utterances on the bus", async () => {
    const { container, conversation } = await createBrainContainer({
      ARIA_LLM_PROVIDER: "echo",
      ARIA_LOG_LEVEL: "error",
    });
    const { bus } = resolveBrainPorts(container);
    const stop = conversation.start();

    const replyPromise = new Promise<string>((resolve) => {
      bus.subscribe(AriaEventType.ConversationAssistantReply, (event) => {
        resolve((event as AssistantReplyEvent).text);
      });
    });

    await bus.publish(createUserUtterance("ping", "en", "manual-1"));
    const reply = await replyPromise;
    expect(reply).toBe("Echo: ping");

    stop();
    await bus.dispose?.();
  });
});

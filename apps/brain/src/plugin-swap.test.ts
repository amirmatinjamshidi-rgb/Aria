import { describe, expect, it } from "vitest";
import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
} from "@aria/contracts";
import { createBrainContainer, resolveBrainPorts } from "../src/composition-root.js";

async function collectReply(
  env: NodeJS.ProcessEnv,
  text: string,
  language: "en" | "fa",
): Promise<{ reply: string; providerId: string }> {
  const { container, conversation } = await createBrainContainer(env);
  const { bus, llm } = resolveBrainPorts(container);
  const stop = conversation.start();

  const replyPromise = new Promise<string>((resolve) => {
    bus.subscribe(AriaEventType.ConversationAssistantReply, (event) => {
      resolve((event as AssistantReplyEvent).text);
    });
  });

  await bus.publish(createUserUtterance(text, language, "test-1"));
  const reply = await replyPromise;

  stop();
  await bus.dispose?.();

  return { reply, providerId: llm.metadata.id };
}

describe("LLM provider hot-swap", () => {
  it("uses mock provider when configured", async () => {
    const { reply, providerId } = await collectReply(
      { ARIA_LLM_PROVIDER: "mock", ARIA_LOG_LEVEL: "error" },
      "hello",
      "en",
    );
    expect(providerId).toBe("mock");
    expect(reply).toContain("mock");
    expect(reply).toContain("hello");
  });

  it("uses echo provider when configured — zero brain code changes", async () => {
    const { reply, providerId } = await collectReply(
      { ARIA_LLM_PROVIDER: "echo", ARIA_LOG_LEVEL: "error" },
      "hello",
      "en",
    );
    expect(providerId).toBe("echo");
    expect(reply).toBe("Echo: hello");
  });

  it("handles Persian with the echo provider", async () => {
    const { reply, providerId } = await collectReply(
      { ARIA_LLM_PROVIDER: "echo", ARIA_LOG_LEVEL: "error" },
      "سلام",
      "fa",
    );
    expect(providerId).toBe("echo");
    expect(reply).toBe("پژواک: سلام");
  });
});

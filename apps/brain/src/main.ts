import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
} from "@aria/contracts";
import { createBrainContainer, resolveBrainPorts } from "./composition-root.js";

/**
 * Phase 0 / Phase 1 starting point:
 * dashboard-less echo conversation over the message bus.
 *
 * Usage:
 *   ARIA_LLM_PROVIDER=mock npm start -w @aria/brain
 *   ARIA_LLM_PROVIDER=echo npm start -w @aria/brain
 */
async function main(): Promise<void> {
  const { container, conversation } = await createBrainContainer();
  const { bus, llm, logger } = resolveBrainPorts(container);

  const stop = conversation.start();

  const replies: string[] = [];
  const unsubReply = bus.subscribe(
    AriaEventType.ConversationAssistantReply,
    (event) => {
      const reply = event as AssistantReplyEvent;
      replies.push(reply.text);
      logger.info("<< assistant", { text: reply.text, language: reply.language });
    },
  );

  const demos = [
    { text: "Hello Aria, who are you?", language: "en" as const },
    { text: "سلام آریا، حالت چطوره؟", language: "fa" as const },
  ];

  for (const [index, demo] of demos.entries()) {
    const correlationId = `demo-${index + 1}`;
    logger.info(">> user", { text: demo.text, language: demo.language });
    await bus.publish(
      createUserUtterance(demo.text, demo.language, correlationId),
    );
  }

  logger.info("demo complete", {
    provider: llm.metadata.id,
    replies: replies.length,
  });

  // Print human-readable summary for CLI demos
  console.log("\n--- Aria Brain Demo ---");
  console.log(`Provider: ${llm.metadata.id} (${llm.metadata.name})`);
  for (const [i, reply] of replies.entries()) {
    console.log(`[${i + 1}] ${reply}`);
  }
  console.log("-----------------------\n");

  unsubReply();
  stop();
  await bus.dispose?.();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

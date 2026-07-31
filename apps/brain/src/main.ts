import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
  type ToolCallCompletedEvent,
} from "@aria/contracts";
import { cli } from "./cli/logger.js";
import { createBrainContainer, resolveBrainPorts } from "./composition-root.js";

/**
 * Phase 1 brain demo: bilingual multi-turn chat + tool calling over the bus.
 *
 * Usage:
 *   ARIA_LLM_PROVIDER=mock npm start -w @aria/brain
 *   ARIA_LLM_PROVIDER=echo npm start -w @aria/brain
 *   ARIA_LLM_PROVIDER=ollama ARIA_OLLAMA_MODEL=qwen3.5:latest npm start -w @aria/brain
 */
async function main(): Promise<void> {
  // Keep structured JSON logs quiet so chalk/ora/boxen output stays readable.
  process.env.ARIA_LOG_LEVEL ??= "warn";

  const spin = cli.spinner("Starting Aria brain…");
  const { container, conversation } = await createBrainContainer();
  const { bus, llm, config } = resolveBrainPorts(container);
  spin.succeed("Brain ready");

  const stop = conversation.start();

  const replies: string[] = [];
  const toolEvents: string[] = [];

  const unsubReply = bus.subscribe(
    AriaEventType.ConversationAssistantReply,
    (event) => {
      const reply = event as AssistantReplyEvent;
      replies.push(reply.text);
      cli.assistant(reply.text, reply.language);
    },
  );

  const unsubTools = bus.subscribe(
    AriaEventType.ConversationToolCallCompleted,
    (event) => {
      const completed = event as ToolCallCompletedEvent;
      toolEvents.push(
        `${completed.result.name}:${completed.result.ok ? "ok" : "err"}`,
      );
      cli.tool(completed.result.name, completed.result.ok);
    },
  );

  const demos = [
    { text: "Hello Aria, who are you?", language: "en" as const },
    { text: "What time is it in UTC?", language: "en" as const },
    { text: "Please turn on the living room light.", language: "en" as const },
    { text: "سلام آریا، حالت چطوره؟", language: "fa" as const },
    { text: "یادت باشه که چای دوست دارم.", language: "fa" as const },
  ];

  cli.info(`Running ${demos.length} demo turns via ${llm.metadata.id}`);

  for (const [index, demo] of demos.entries()) {
    const correlationId = `demo-${index + 1}`;
    cli.user(demo.text, demo.language);
    await bus.publish(
      createUserUtterance(demo.text, demo.language, correlationId),
    );
  }

  const summaryLines = [
    `Provider: ${llm.metadata.id} (${llm.metadata.name})`,
  ];
  if (config.llmProvider === "ollama") {
    summaryLines.push(
      `Model: ${config.ollama.model} @ ${config.ollama.baseUrl}`,
    );
  }
  summaryLines.push(`Tools enabled: ${config.tools.enabled}`);
  summaryLines.push(`Replies: ${replies.length}`);
  if (toolEvents.length > 0) {
    summaryLines.push(`Tool calls: ${toolEvents.join(", ")}`);
  }
  for (const [i, reply] of replies.entries()) {
    summaryLines.push(`[${i + 1}] ${reply}`);
  }

  cli.box("Aria Brain Demo (Phase 1)", summaryLines);
  cli.success("Demo complete");

  unsubTools();
  unsubReply();
  stop();
  await bus.dispose?.();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  cli.error(message);
  process.exitCode = 1;
});

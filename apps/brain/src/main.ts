import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
  type ToolCallCompletedEvent,
} from "@aria/contracts";
import { cli } from "./cli/logger.js";
import { createBrainContainer, resolveBrainPorts } from "./composition-root.js";

/**
 * Phase 1 brain demo: fixed bilingual multi-turn script over the message bus.
 * For interactive chat, use: npm run chat -w @aria/brain
 *
 * Usage:
 *   ARIA_LLM_PROVIDER=mock npm start -w @aria/brain
 *   ARIA_LLM_PROVIDER=echo npm start -w @aria/brain
 *   ARIA_LLM_PROVIDER=ollama ARIA_OLLAMA_MODEL=qwen3.5:latest npm start -w @aria/brain
 *   ARIA_LLM_PROVIDER=openrouter ARIA_OPENROUTER_API_KEY=sk-or-... npm start -w @aria/brain
 */
async function main(): Promise<void> {
  // Keep structured JSON logs quiet so chalk/ora/boxen output stays readable.
  process.env.ARIA_LOG_LEVEL ??= "warn";

  const spin = cli.spinner("Starting Aria brain…");
  const { container, conversation } = await createBrainContainer();
  const { bus, llm, config } = resolveBrainPorts(container);
  spin.succeed("Brain ready");

  cli.banner("fixed demo script");

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
  cli.divider();

  for (const [index, demo] of demos.entries()) {
    const correlationId = `demo-${index + 1}`;
    cli.user(demo.text, demo.language);
    await bus.publish(
      createUserUtterance(demo.text, demo.language, correlationId),
    );
  }

  const entries: Array<readonly [string, string]> = [
    ["Provider", `${llm.metadata.id} (${llm.metadata.name})`],
    ["Tools", String(config.tools.enabled)],
    ["Replies", String(replies.length)],
  ];
  if (config.llmProvider === "ollama") {
    entries.splice(1, 0, [
      "Model",
      `${config.ollama.model} @ ${config.ollama.baseUrl}`,
    ]);
  } else if (config.llmProvider === "openrouter") {
    entries.splice(1, 0, [
      "Model",
      `${config.openrouter.model} @ ${config.openrouter.baseUrl}`,
    ]);
  }
  if (toolEvents.length > 0) {
    entries.push(["Tool calls", toolEvents.join(", ")]);
  }

  const summaryLines = [
    ...cli.kv(entries),
    "",
    ...replies.map(
      (reply, i) =>
        `${cli.brand.muted(`[${i + 1}]`)}  ${cli.brand.soft(reply)}`,
    ),
  ];

  cli.box("Aria Brain Demo (Phase 1)", summaryLines);
  cli.success("Demo complete");
  cli.goodbye();

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

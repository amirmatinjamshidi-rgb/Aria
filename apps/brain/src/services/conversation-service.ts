import {
  AriaEventType,
  createAssistantReply,
  createToolCallCompleted,
  createToolCallRequested,
  type ChatMessage,
  type IConversationPlanner,
  type ILLMProvider,
  type IMemoryStore,
  type IMessageBus,
  type IPersonalityService,
  type IToolRegistry,
  type IToolResultSynthesizer,
  type LanguageCode,
  type UserUtteranceEvent,
} from "@aria/contracts";
import type { Logger } from "@aria/core";
import { MetricsCollector, TurnTimer, type TurnMetrics } from "../metrics/turn-timer.js";

export interface ConversationServiceOptions {
  readonly toolsEnabled: boolean;
  readonly maxToolRounds: number;
}

/**
 * Brain conversation service.
 * Orchestrates personality → memory → LLM → planner validation → tools → synthesis.
 * Depends only on ports — never concrete model/hardware adapters.
 */
export class ConversationService {
  private readonly history: ChatMessage[] = [];
  private readonly metrics = new MetricsCollector();

  constructor(
    private readonly llm: ILLMProvider,
    private readonly bus: IMessageBus,
    private readonly logger: Logger,
    private readonly personality: IPersonalityService,
    private readonly tools: IToolRegistry,
    private readonly synthesizer: IToolResultSynthesizer,
    private readonly planner: IConversationPlanner,
    private readonly memory: IMemoryStore,
    private readonly options: ConversationServiceOptions,
  ) {}

  start(): () => void {
    return this.bus.subscribe(
      AriaEventType.ConversationUserUtterance,
      (event) => this.handleUtterance(event as UserUtteranceEvent),
    );
  }

  getHistory(): readonly ChatMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history.length = 0;
  }

  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  private async handleUtterance(event: UserUtteranceEvent): Promise<void> {
    const timer = new TurnTimer();
    let toolCount = 0;
    let memoryHits = 0;

    this.logger.info("user utterance received", {
      correlationId: event.correlationId,
      language: event.language,
      provider: this.llm.metadata.id,
    });

    this.history.push({ role: "user", content: event.text });

    const toolDefs = this.options.toolsEnabled
      ? this.tools.listDefinitions()
      : [];

    const plan = this.planner.assess({
      text: event.text,
      language: event.language,
      availableTools: toolDefs,
    });

    if (plan.rejected) {
      const text =
        plan.rejectionReason ??
        (event.language === "fa"
          ? "نمی‌توانم این درخواست را انجام دهم."
          : "I cannot fulfill that request.");
      await this.publishReply(text, event.language, event.correlationId);
      this.recordTurn(timer, event, 0, 0, 0, text.length);
      return;
    }

    timer.start("memory");
    const memories = await this.memory.query({
      text: event.text,
      limit: 4,
    });
    memoryHits = memories.length;
    timer.end("memory");

    const memoryBlock =
      memories.length > 0
        ? [
            event.language === "fa"
              ? "حافظه مرتبط این نشست:"
              : "Relevant session memory:",
            ...memories.map((m) => `- (${m.kind}) ${m.content}`),
          ].join("\n")
        : "";

    const basePrompt = this.personality.buildSystemPrompt(event.language);
    const systemPrompt = memoryBlock
      ? `${basePrompt}\n\n${memoryBlock}`
      : basePrompt;

    let rounds = 0;
    let finalContent = "";
    let finalLanguage: LanguageCode = event.language;
    const toolNarratives: string[] = [];

    try {
      while (rounds <= this.options.maxToolRounds) {
        const messages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          ...this.history,
        ];

        timer.start("llm");
        const completion = await this.llm.generate(messages, {
          languageHint: event.language,
          tools:
            plan.allowTools && toolDefs.length > 0 ? toolDefs : undefined,
        });
        timer.end("llm");

        await this.bus.publish({
          type: AriaEventType.ConversationLlmCompletion,
          correlationId: event.correlationId,
          messages,
          completion,
          timestamp: new Date().toISOString(),
        });

        finalLanguage = completion.language ?? event.language;

        if (
          completion.toolCalls.length > 0 &&
          rounds < this.options.maxToolRounds
        ) {
          const validation = this.planner.validateToolCalls(
            completion.toolCalls,
            toolDefs,
          );

          for (const rejected of validation.rejected) {
            this.logger.warn("tool call rejected by planner", {
              correlationId: event.correlationId,
              tool: rejected.name,
              reason: rejected.reason,
            });
          }

          if (validation.accepted.length === 0) {
            finalContent =
              completion.content.trim() ||
              (finalLanguage === "fa"
                ? "نتوانستم ابزار معتبری برای این درخواست اجرا کنم."
                : "I could not run a valid tool for that request.");
            this.history.push({ role: "assistant", content: finalContent });
            break;
          }

          this.history.push({
            role: "assistant",
            content: completion.content || "",
          });

          for (const toolCall of validation.accepted) {
            await this.bus.publish(
              createToolCallRequested(toolCall, event.correlationId),
            );

            timer.start("tool");
            const result = await this.tools.execute(toolCall, {
              correlationId: event.correlationId,
              language: event.language,
            });
            timer.end("tool");
            toolCount += 1;

            await this.bus.publish(
              createToolCallCompleted(result, event.correlationId),
            );

            const narrative = this.synthesizer.synthesize(
              result,
              event.language,
            );
            toolNarratives.push(narrative);

            // Feed the model a natural summary — never raw JSON dumps
            this.history.push({
              role: "tool",
              name: toolCall.name,
              toolCallId: toolCall.id,
              content: narrative,
            });

            await this.maybePersistToolMemory(toolCall.name, result);

            this.logger.info("tool executed", {
              correlationId: event.correlationId,
              tool: toolCall.name,
              ok: result.ok,
            });
          }

          rounds += 1;
          continue;
        }

        finalContent = completion.content.trim();
        this.history.push({ role: "assistant", content: finalContent });
        break;
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error("conversation turn failed", {
        correlationId: event.correlationId,
        error: detail,
      });
      finalContent =
        event.language === "fa"
          ? "مشکلی در پردازش درخواست پیش آمد. لطفاً دوباره تلاش کنید."
          : "Something went wrong processing that request. Please try again.";
      this.history.push({ role: "assistant", content: finalContent });
    }

    if (!finalContent) {
      // Prefer synthesized tool narratives over empty / JSON replies
      finalContent =
        toolNarratives.at(-1) ??
        (finalLanguage === "fa"
          ? "انجام شد."
          : "Done.");
      this.history.push({ role: "assistant", content: finalContent });
    }

    if (this.synthesizer.looksLikeRawToolDump(finalContent)) {
      finalContent =
        toolNarratives.at(-1) ??
        (finalLanguage === "fa"
          ? "انجام شد."
          : "Done.");
    }

    await this.publishReply(finalContent, finalLanguage, event.correlationId);
    this.recordTurn(
      timer,
      event,
      rounds,
      toolCount,
      memoryHits,
      finalContent.length,
    );
  }

  private async publishReply(
    text: string,
    language: LanguageCode,
    correlationId: string,
  ): Promise<void> {
    await this.bus.publish(createAssistantReply(text, language, correlationId));
    this.logger.info("assistant reply published", {
      correlationId,
      provider: this.llm.metadata.id,
    });
  }

  private async maybePersistToolMemory(
    toolName: string,
    result: { ok: boolean; result?: unknown },
  ): Promise<void> {
    if (!result.ok || toolName !== "note_preference") {
      return;
    }
    const data =
      result.result && typeof result.result === "object"
        ? (result.result as Record<string, unknown>)
        : {};
    const key = typeof data["key"] === "string" ? data["key"] : undefined;
    const value = typeof data["value"] === "string" ? data["value"] : undefined;
    if (!key || !value) {
      return;
    }
    await this.memory.store({
      kind: "preference",
      content: `${key}: ${value}`,
      metadata: { key, value },
    });
  }

  private recordTurn(
    timer: TurnTimer,
    event: UserUtteranceEvent,
    toolRounds: number,
    toolCount: number,
    memoryHits: number,
    replyChars: number,
  ): void {
    const turn: TurnMetrics = timer.finish({
      correlationId: event.correlationId,
      providerId: this.llm.metadata.id,
      language: event.language,
      toolRounds,
      toolCount,
      memoryHits,
      replyChars,
    });
    this.metrics.record(turn);
    this.logger.info("turn metrics", {
      correlationId: turn.correlationId,
      totalMs: Math.round(turn.totalMs),
      toolRounds: turn.toolRounds,
      memoryHits: turn.memoryHits,
    });
  }
}

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
  type IToolCatalog,
  type IToolExecutor,
  type IToolResultSynthesizer,
  type LanguageCode,
  type PermissionId,
  type UserUtteranceEvent,
  type VoiceInterruptedEvent,
} from "@aria/contracts";
import type { Logger } from "@aria/core";
import { LoggingDecisionTraceWriter } from "@aria/tool-runtime";
import { MetricsCollector, TurnTimer, type TurnMetrics } from "../metrics/turn-timer.js";

export interface ConversationServiceOptions {
  readonly toolsEnabled: boolean;
  readonly maxToolRounds: number;
  readonly grantedPermissions: ReadonlySet<PermissionId>;
}

/**
 * Brain conversation service.
 * Orchestrates personality → memory → LLM → planner validation → tools → synthesis.
 * Depends only on ports — never concrete model/hardware adapters.
 */
export class ConversationService {
  private readonly history: ChatMessage[] = [];
  private readonly metrics = new MetricsCollector();
  private readonly activeTurnControllers = new Map<string, AbortController>();
  private readonly decisionTraces: LoggingDecisionTraceWriter;

  constructor(
    private readonly llm: ILLMProvider,
    private readonly bus: IMessageBus,
    private readonly logger: Logger,
    private readonly personality: IPersonalityService,
    private readonly catalog: IToolCatalog,
    private readonly executor: IToolExecutor,
    private readonly synthesizer: IToolResultSynthesizer,
    private readonly planner: IConversationPlanner,
    private readonly memory: IMemoryStore,
    private readonly options: ConversationServiceOptions,
  ) {
    this.decisionTraces = new LoggingDecisionTraceWriter((message, meta) =>
      this.logger.info(message, meta),
    );
  }

  start(): () => void {
    const stopUtterances = this.bus.subscribe(
      AriaEventType.ConversationUserUtterance,
      (event) => this.handleUtterance(event as UserUtteranceEvent),
    );
    const stopInterrupts = this.bus.subscribe(
      AriaEventType.VoiceInterrupted,
      (event) => {
        const interrupted = event as VoiceInterruptedEvent;
        if (interrupted.correlationId) {
          this.activeTurnControllers
            .get(interrupted.correlationId)
            ?.abort();
        }
      },
    );
    return () => {
      stopUtterances();
      stopInterrupts();
      for (const controller of this.activeTurnControllers.values()) {
        controller.abort();
      }
      this.activeTurnControllers.clear();
    };
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
    const turnController = new AbortController();
    this.activeTurnControllers.set(event.correlationId, turnController);
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
      ? this.catalog.definitionsForLlm({
          permissions: this.options.grantedPermissions,
          enabledOnly: true,
        })
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
      this.activeTurnControllers.delete(event.correlationId);
      return;
    }

    timer.start("memory");
    const memories = await this.memory.query({
      text: event.text,
      limit: 4,
    });
    memoryHits = memories.length;
    timer.end("memory");
    if (turnController.signal.aborted) {
      this.activeTurnControllers.delete(event.correlationId);
      return;
    }

    const memoryBlock =
      memories.length > 0
        ? [
            event.language === "fa"
              ? "حافظه مرتبط این نشست:"
              : "Relevant session memory:",
            ...memories.map((m) => `- (${m.kind}) ${m.content}`),
          ].join("\n")
        : "";

    const catalogGuidance = this.catalog.toPromptGuidance({
      permissions: this.options.grantedPermissions,
      maxTools: 40,
    });

    const basePrompt = this.personality.buildSystemPrompt(event.language);
    const systemPrompt = [basePrompt, memoryBlock, catalogGuidance]
      .filter((block) => block && block.length > 0)
      .join("\n\n");

    let rounds = 0;
    let finalContent = "";
    let finalLanguage: LanguageCode = event.language;
    const toolNarratives: string[] = [];

    const execContext = {
      correlationId: event.correlationId,
      language: event.language,
      signal: turnController.signal,
      grantedPermissions: this.options.grantedPermissions,
    };

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
          signal: turnController.signal,
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

          this.decisionTraces.write({
            correlationId: event.correlationId,
            catalogVersion: this.catalog.version,
            accepted: validation.accepted.map((c) => c.name),
            rejected: validation.rejected.map((r) => ({
              name: r.name,
              code: r.code ?? "REJECTED",
              reason: r.reason,
            })),
            timestamp: new Date().toISOString(),
          });

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

          timer.start("tool");
          const results = await this.executor.executeMany(
            validation.accepted,
            execContext,
          );
          timer.end("tool");

          for (let i = 0; i < validation.accepted.length; i += 1) {
            const toolCall = validation.accepted[i]!;
            const result = results[i]!;
            toolCount += 1;

            await this.bus.publish(
              createToolCallRequested(toolCall, event.correlationId),
            );
            await this.bus.publish(
              createToolCallCompleted(result, event.correlationId),
            );

            const narrative = this.synthesizer.synthesize(
              result,
              event.language,
            );
            toolNarratives.push(narrative);

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
      if (turnController.signal.aborted) {
        this.logger.info("conversation turn cancelled", {
          correlationId: event.correlationId,
        });
        this.activeTurnControllers.delete(event.correlationId);
        return;
      }
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
      finalContent =
        toolNarratives.at(-1) ??
        (finalLanguage === "fa" ? "انجام شد." : "Done.");
      this.history.push({ role: "assistant", content: finalContent });
    }

    if (this.synthesizer.looksLikeRawToolDump(finalContent)) {
      finalContent =
        toolNarratives.at(-1) ??
        (finalLanguage === "fa" ? "انجام شد." : "Done.");
    }

    if (turnController.signal.aborted) {
      this.activeTurnControllers.delete(event.correlationId);
      return;
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
    this.activeTurnControllers.delete(event.correlationId);
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
    if (
      !result.ok ||
      (toolName !== "note_preference" && toolName !== "update_preference")
    ) {
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
    // Preference tools already write to memory; avoid duplicate store.
    if (toolName === "update_preference" || toolName === "note_preference") {
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

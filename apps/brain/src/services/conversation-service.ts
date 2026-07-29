import {
  AriaEventType,
  createAssistantReply,
  type ChatMessage,
  type ILLMProvider,
  type IMessageBus,
  type LanguageCode,
  type UserUtteranceEvent,
} from "@aria/contracts";
import type { Logger } from "@aria/core";

/**
 * Brain conversation service.
 * Depends only on ports (ILLMProvider, IMessageBus) — never concrete models.
 */
export class ConversationService {
  private readonly history: ChatMessage[] = [];

  constructor(
    private readonly llm: ILLMProvider,
    private readonly bus: IMessageBus,
    private readonly logger: Logger,
    private readonly systemPrompt: string,
  ) {}

  start(): () => void {
    return this.bus.subscribe(
      AriaEventType.ConversationUserUtterance,
      (event) => this.handleUtterance(event as UserUtteranceEvent),
    );
  }

  private async handleUtterance(event: UserUtteranceEvent): Promise<void> {
    this.logger.info("user utterance received", {
      correlationId: event.correlationId,
      language: event.language,
      provider: this.llm.metadata.id,
    });

    this.history.push({ role: "user", content: event.text });

    const messages: ChatMessage[] = [
      { role: "system", content: this.systemPrompt },
      ...this.history,
    ];

    const completion = await this.llm.generate(messages, {
      languageHint: event.language,
    });

    this.history.push({ role: "assistant", content: completion.content });

    const language: LanguageCode = completion.language ?? event.language;
    const reply = createAssistantReply(
      completion.content,
      language,
      event.correlationId,
    );
    await this.bus.publish(reply);

    this.logger.info("assistant reply published", {
      correlationId: event.correlationId,
      provider: this.llm.metadata.id,
    });
  }
}

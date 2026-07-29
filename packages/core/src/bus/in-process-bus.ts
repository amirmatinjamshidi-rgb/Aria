import type { AriaEvent, AriaEventTypeName, EventHandler, IMessageBus } from "@aria/contracts";

type HandlerEntry = {
  type: AriaEventTypeName | "*";
  handler: EventHandler;
};

/**
 * In-process message bus for development and single-process deployments.
 * Same IMessageBus contract as the future NATS adapter.
 */
export class InProcessMessageBus implements IMessageBus {
  private readonly handlers: HandlerEntry[] = [];

  async publish(event: AriaEvent): Promise<void> {
    const matching = this.handlers.filter(
      (entry) => entry.type === "*" || entry.type === event.type,
    );
    for (const entry of matching) {
      await entry.handler(event);
    }
  }

  subscribe<T extends AriaEvent = AriaEvent>(
    type: AriaEventTypeName | "*",
    handler: EventHandler<T>,
  ): () => void {
    const entry: HandlerEntry = {
      type,
      handler: handler as EventHandler,
    };
    this.handlers.push(entry);
    return () => {
      const index = this.handlers.indexOf(entry);
      if (index >= 0) {
        this.handlers.splice(index, 1);
      }
    };
  }

  async dispose(): Promise<void> {
    this.handlers.length = 0;
  }
}

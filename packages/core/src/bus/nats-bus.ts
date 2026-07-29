import type { AriaEvent, AriaEventTypeName, EventHandler, IMessageBus } from "@aria/contracts";

/**
 * NATS adapter stub.
 * Phase 0 wires the contract; real NATS client lands when services split processes.
 */
export class NatsMessageBus implements IMessageBus {
  private connected = false;

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    // Intentionally unimplemented in Phase 0 — keeps the port hot-swappable.
    this.connected = true;
    void this.url;
  }

  async publish(_event: AriaEvent): Promise<void> {
    if (!this.connected) {
      throw new Error("NatsMessageBus is not connected. Call connect() first.");
    }
    throw new Error(
      "NatsMessageBus.publish is a Phase 0 stub. Use InProcessMessageBus or implement NATS.",
    );
  }

  subscribe<T extends AriaEvent = AriaEvent>(
    _type: AriaEventTypeName | "*",
    _handler: EventHandler<T>,
  ): () => void {
    throw new Error(
      "NatsMessageBus.subscribe is a Phase 0 stub. Use InProcessMessageBus or implement NATS.",
    );
  }

  async dispose(): Promise<void> {
    this.connected = false;
  }
}

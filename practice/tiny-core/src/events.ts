/**
 * Tiny event catalog for the kata (given — no work needed here).
 *
 * This mirrors how @aria/contracts declares a discriminated union of
 * events. Read it carefully: the `type` field is the discriminant, and
 * every service in Aria communicates ONLY through events like these.
 */

export interface GreetingRequestedEvent {
  readonly type: "greeting.requested";
  readonly name: string;
  readonly correlationId: string;
}

export interface GreetingDeliveredEvent {
  readonly type: "greeting.delivered";
  readonly text: string;
  readonly providerId: string;
  readonly correlationId: string;
}

export type TinyEvent = GreetingRequestedEvent | GreetingDeliveredEvent;

export type TinyEventType = TinyEvent["type"];

export type Handler<E extends TinyEvent = TinyEvent> = (
  event: E,
) => void | Promise<void>;

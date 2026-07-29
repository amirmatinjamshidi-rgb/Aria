export const TOKENS = {
  Config: Symbol.for("aria.config"),
  Logger: Symbol.for("aria.logger"),
  MessageBus: Symbol.for("aria.messageBus"),
  LlmProvider: Symbol.for("aria.llmProvider"),
  SttProvider: Symbol.for("aria.sttProvider"),
  TtsProvider: Symbol.for("aria.ttsProvider"),
  VisionProvider: Symbol.for("aria.visionProvider"),
  MemoryStore: Symbol.for("aria.memoryStore"),
} as const;

export type Token = (typeof TOKENS)[keyof typeof TOKENS];

type Factory<T> = (container: Container) => T;

interface Registration<T = unknown> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

/**
 * Minimal constructor-injection container.
 * No service locator pattern — resolve only at composition roots.
 */
export class Container {
  private readonly registrations = new Map<symbol, Registration>();

  register<T>(
    token: symbol,
    factory: Factory<T>,
    options: { singleton?: boolean } = {},
  ): this {
    this.registrations.set(token, {
      factory,
      singleton: options.singleton ?? true,
    });
    return this;
  }

  registerInstance<T>(token: symbol, instance: T): this {
    this.registrations.set(token, {
      factory: () => instance,
      singleton: true,
      instance,
    });
    return this;
  }

  resolve<T>(token: symbol): T {
    const registration = this.registrations.get(token);
    if (!registration) {
      throw new Error(`No registration for token: ${String(token)}`);
    }
    if (registration.singleton) {
      if (registration.instance === undefined) {
        registration.instance = registration.factory(this);
      }
      return registration.instance as T;
    }
    return registration.factory(this) as T;
  }

  has(token: symbol): boolean {
    return this.registrations.has(token);
  }
}

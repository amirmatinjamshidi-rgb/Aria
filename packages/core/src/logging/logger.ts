import type { LogLevel } from "@aria/contracts";

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export class ConsoleLogger implements Logger {
  constructor(
    private readonly level: LogLevel = "info",
    private readonly bindings: Record<string, unknown> = {},
  ) {}

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write("error", message, context);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.level, { ...this.bindings, ...bindings });
  }

  private write(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) {
      return;
    }
    const payload = {
      level,
      time: new Date().toISOString(),
      msg: message,
      ...this.bindings,
      ...context,
    };
    const line = JSON.stringify(payload);
    switch (level) {
      case "error":
      case "fatal":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "debug":
      case "info":
        console.log(line);
        break;
      default: {
        const _exhaustive: never = level;
        void _exhaustive;
        console.log(line);
      }
    }
  }
}

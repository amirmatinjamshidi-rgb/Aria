import type {
  IToolResultFormatter,
  IToolResultFormatterRegistry,
  IToolResultSynthesizer,
  LanguageCode,
  ToolResult,
} from "@aria/contracts";
import { toolErrorMessage } from "@aria/contracts";

export class ToolResultFormatterRegistry implements IToolResultFormatterRegistry {
  private readonly formatters = new Map<string, IToolResultFormatter>();

  register(formatter: IToolResultFormatter): void {
    this.formatters.set(formatter.toolName, formatter);
  }

  get(toolName: string): IToolResultFormatter | undefined {
    return this.formatters.get(toolName);
  }
}

/**
 * Synthesizer that prefers registered formatters, then a safe generic summary.
 */
export class CatalogToolResultSynthesizer implements IToolResultSynthesizer {
  constructor(private readonly formatters: IToolResultFormatterRegistry) {}

  synthesize(result: ToolResult, language: LanguageCode): string {
    if (!result.ok) {
      const message = toolErrorMessage(result.error);
      return language === "fa"
        ? `نتوانستم «${result.name}» را انجام دهم: ${message}`
        : `I could not complete "${result.name}": ${message}`;
    }

    const formatter = this.formatters.get(result.name);
    if (formatter) {
      return formatter.format(result, language);
    }

    return this.synthesizeGeneric(result.name, result.result, language);
  }

  looksLikeRawToolDump(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return true;
    }
    return /Tool result:\s*\{/i.test(trimmed) || /نتیجه ابزار:\s*\{/.test(trimmed);
  }

  private synthesizeGeneric(
    name: string,
    raw: unknown,
    language: LanguageCode,
  ): string {
    const summary =
      typeof raw === "string" ? raw : JSON.stringify(raw ?? null);
    const capped = summary.length > 800 ? `${summary.slice(0, 800)}…` : summary;
    return language === "fa"
      ? `نتیجه «${name}»: ${capped}`
      : `Result of "${name}": ${capped}`;
  }
}

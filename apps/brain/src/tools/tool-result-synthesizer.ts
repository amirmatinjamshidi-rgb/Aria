import type {
  IToolResultSynthesizer,
  LanguageCode,
  ToolResult,
} from "@aria/contracts";

/**
 * Converts structured tool results into natural language.
 * Tools stay data-only; this service owns user-facing wording.
 */
export class ToolResultSynthesizer implements IToolResultSynthesizer {
  synthesize(result: ToolResult, language: LanguageCode): string {
    if (!result.ok) {
      return language === "fa"
        ? `نتوانستم «${result.name}» را انجام دهم: ${result.error ?? "خطای نامشخص"}`
        : `I could not complete "${result.name}": ${result.error ?? "unknown error"}`;
    }

    switch (result.name) {
      case "get_current_time":
        return this.synthesizeTime(result.result, language);
      case "set_light":
        return this.synthesizeLight(result.result, language);
      case "note_preference":
        return this.synthesizeNote(result.result, language);
      default:
        return this.synthesizeGeneric(result.name, result.result, language);
    }
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

  private synthesizeTime(raw: unknown, language: LanguageCode): string {
    const data = asRecord(raw);
    const local = stringField(data, "local");
    const iso = stringField(data, "iso");
    const timezone = stringField(data, "timezone") ?? "UTC";
    const when = local ?? iso ?? "unknown";
    return language === "fa"
      ? `الان ${when} است (منطقه زمانی ${timezone}).`
      : `It is currently ${when} (${timezone}).`;
  }

  private synthesizeLight(raw: unknown, language: LanguageCode): string {
    const data = asRecord(raw);
    const room = stringField(data, "room") ?? "room";
    const on = Boolean(data["on"]);
    const roomLabel = room.replaceAll("_", " ");
    return language === "fa"
      ? on
        ? `چراغ ${roomLabel} روشن شد.`
        : `چراغ ${roomLabel} خاموش شد.`
      : on
        ? `The ${roomLabel} light is now on.`
        : `The ${roomLabel} light is now off.`;
  }

  private synthesizeNote(raw: unknown, language: LanguageCode): string {
    const data = asRecord(raw);
    const key = stringField(data, "key") ?? "preference";
    const value = stringField(data, "value") ?? "";
    return language === "fa"
      ? `یادداشت شد: ${key} = ${value}.`
      : `Noted: ${key} is ${value}.`;
  }

  private synthesizeGeneric(
    name: string,
    raw: unknown,
    language: LanguageCode,
  ): string {
    const summary =
      typeof raw === "string" ? raw : JSON.stringify(raw ?? null);
    return language === "fa"
      ? `نتیجه «${name}»: ${summary}`
      : `Result of "${name}": ${summary}`;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

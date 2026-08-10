import type {
  IToolResultFormatter,
  LanguageCode,
  ToolResult,
} from "@aria/contracts";

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

class NamedFormatter implements IToolResultFormatter {
  constructor(
    readonly toolName: string,
    private readonly formatFn: (result: ToolResult, language: LanguageCode) => string,
  ) {}

  format(result: ToolResult, language: LanguageCode): string {
    return this.formatFn(result, language);
  }
}

function synthesizeTime(raw: unknown, language: LanguageCode): string {
  const data = asRecord(raw);
  const local = stringField(data, "local");
  const iso = stringField(data, "iso");
  const timezone = stringField(data, "timezone") ?? "UTC";
  const when = local ?? iso ?? "unknown";
  return language === "fa"
    ? `الان ${when} است (منطقه زمانی ${timezone}).`
    : `It is currently ${when} (${timezone}).`;
}

function synthesizeLight(raw: unknown, language: LanguageCode): string {
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

function synthesizeNote(raw: unknown, language: LanguageCode): string {
  const data = asRecord(raw);
  const key = stringField(data, "key") ?? "preference";
  const value = stringField(data, "value") ?? "";
  return language === "fa"
    ? `یادداشت شد: ${key} = ${value}.`
    : `Noted: ${key} is ${value}.`;
}

function synthesizeWebSearch(raw: unknown, language: LanguageCode): string {
  const data = asRecord(raw);
  const query = stringField(data, "query") ?? "";
  const hits = Array.isArray(data["hits"]) ? data["hits"] : [];
  if (hits.length === 0) {
    return language === "fa"
      ? `جستجو برای «${query}» نتیجه‌ای نداشت.`
      : `No web results found for "${query}".`;
  }

  const lines = hits.slice(0, 5).map((hit, index) => {
    const item = asRecord(hit);
    const title = stringField(item, "title") ?? "Untitled";
    const url = stringField(item, "url") ?? "";
    const snippet = stringField(item, "snippet") ?? "";
    const snippetBit = snippet ? ` — ${snippet.slice(0, 160)}` : "";
    return `${index + 1}. ${title}${url ? ` (${url})` : ""}${snippetBit}`;
  });

  return language === "fa"
    ? `نتایج وب برای «${query}»:\n${lines.join("\n")}`
    : `Web results for "${query}":\n${lines.join("\n")}`;
}

function synthesizeFetchPage(raw: unknown, language: LanguageCode): string {
  const data = asRecord(raw);
  const title = stringField(data, "title");
  const url = stringField(data, "url") ?? "";
  const text = stringField(data, "text") ?? "";
  const truncated = Boolean(data["truncated"]);
  const preview = text.slice(0, 500);
  const more = truncated || text.length > 500 ? "…" : "";
  const heading = title || url || "page";

  return language === "fa"
    ? `محتوای «${heading}»:\n${preview}${more}`
    : `Content from "${heading}":\n${preview}${more}`;
}

function synthesizeMemorySearch(raw: unknown, language: LanguageCode): string {
  const data = asRecord(raw);
  const count = typeof data["count"] === "number" ? data["count"] : 0;
  const records = Array.isArray(data["records"]) ? data["records"] : [];
  if (count === 0) {
    return language === "fa"
      ? "چیزی در حافظه پیدا نشد."
      : "No matching memories found.";
  }
  const lines = records.slice(0, 5).map((r) => {
    const item = asRecord(r);
    return `- (${stringField(item, "kind") ?? "memory"}) ${stringField(item, "content") ?? ""}`;
  });
  return language === "fa"
    ? `حافظه مرتبط:\n${lines.join("\n")}`
    : `Related memories:\n${lines.join("\n")}`;
}

/** Register NL formatters for shipped tools (no giant synthesizer switch). */
export function createBuiltinFormatters(): IToolResultFormatter[] {
  return [
    new NamedFormatter("get_current_time", (r, lang) =>
      synthesizeTime(r.result, lang),
    ),
    new NamedFormatter("set_light", (r, lang) => synthesizeLight(r.result, lang)),
    new NamedFormatter("note_preference", (r, lang) =>
      synthesizeNote(r.result, lang),
    ),
    new NamedFormatter("update_preference", (r, lang) =>
      synthesizeNote(r.result, lang),
    ),
    new NamedFormatter("remember_fact", (r, lang) => {
      const data = asRecord(r.result);
      const content = stringField(data, "content") ?? "";
      return lang === "fa" ? `به خاطر سپردم: ${content}` : `Remembered: ${content}`;
    }),
    new NamedFormatter("forget_fact", (r, lang) => {
      const data = asRecord(r.result);
      const id = stringField(data, "id") ?? "";
      return lang === "fa" ? `حافظه ${id} حذف شد.` : `Forgot memory ${id}.`;
    }),
    new NamedFormatter("search_memory", (r, lang) =>
      synthesizeMemorySearch(r.result, lang),
    ),
    new NamedFormatter("session_summary", (r, lang) => {
      const data = asRecord(r.result);
      const items = Array.isArray(data["items"]) ? data["items"] : [];
      if (items.length === 0) {
        return lang === "fa" ? "حافظه نشست خالی است." : "Session memory is empty.";
      }
      return lang === "fa"
        ? `خلاصه نشست:\n${items.join("\n")}`
        : `Session summary:\n${items.join("\n")}`;
    }),
    new NamedFormatter("conversation_summary", (r, lang) => {
      const data = asRecord(r.result);
      const lines = Array.isArray(data["lines"]) ? data["lines"] : [];
      return lang === "fa"
        ? `خلاصه گفتگو:\n${lines.join("\n")}`
        : `Conversation summary:\n${lines.join("\n")}`;
    }),
    new NamedFormatter("search_web", (r, lang) =>
      synthesizeWebSearch(r.result, lang),
    ),
    new NamedFormatter("web_search", (r, lang) =>
      synthesizeWebSearch(r.result, lang),
    ),
    new NamedFormatter("search_wikipedia", (r, lang) =>
      synthesizeWebSearch(r.result, lang),
    ),
    new NamedFormatter("fetch_page", (r, lang) =>
      synthesizeFetchPage(r.result, lang),
    ),
    new NamedFormatter("search_documentation", (r, lang) =>
      synthesizeWebSearch(r.result, lang),
    ),
    new NamedFormatter("search_github", (r, lang) =>
      synthesizeWebSearch(r.result, lang),
    ),
    new NamedFormatter("search_stackoverflow", (r, lang) =>
      synthesizeWebSearch(r.result, lang),
    ),
    new NamedFormatter("search_news", (r, lang) =>
      synthesizeWebSearch(r.result, lang),
    ),
    new NamedFormatter("search_local_memory", (r, lang) =>
      synthesizeWebSearch(r.result, lang),
    ),
  ];
}

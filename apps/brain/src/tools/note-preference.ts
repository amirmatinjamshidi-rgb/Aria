import type { ITool, ToolDefinition, ToolExecutionContext } from "@aria/contracts";

/**
 * In-memory preference notepad for Phase 1 tool-calling demos.
 * Real persistence lands with Phase 3 memory.
 */
export class NotePreferenceTool implements ITool {
  private readonly notes: Array<{
    key: string;
    value: string;
    at: string;
  }> = [];

  readonly definition: ToolDefinition = {
    name: "note_preference",
    description:
      "Stores a short user preference or fact for this session (e.g. favorite tea).",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Short preference key, e.g. favorite_drink",
        },
        value: {
          type: "string",
          description: "Preference value, e.g. green tea",
        },
      },
      required: ["key", "value"],
    },
  };

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const key = String(args["key"] ?? "").trim();
    const value = String(args["value"] ?? "").trim();
    if (!key || !value) {
      throw new Error("note_preference requires non-empty key and value");
    }

    const entry = { key, value, at: new Date().toISOString() };
    this.notes.push(entry);
    return { stored: true, ...entry, count: this.notes.length };
  }

  list(): readonly { key: string; value: string; at: string }[] {
    return this.notes;
  }
}

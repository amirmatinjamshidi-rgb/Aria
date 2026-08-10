import type {
  IMemoryStore,
  ToolExecutionContext,
} from "@aria/contracts";
import { BaseTool, throwToolError } from "@aria/tool-runtime";
import { defineToolMeta } from "../../define-tool-meta.js";

export class RememberFactTool extends BaseTool {
  constructor(private readonly memory: IMemoryStore) {
    super(
      defineToolMeta({
        id: "memory.remember_fact",
        name: "remember_fact",
        category: "Memory",
        tags: ["memory", "fact"],
        permissions: ["memory.write"],
        description: "Store a durable fact about the user or environment in memory.",
        inputSchema: {
          type: "object",
          properties: {
            fact: { type: "string", description: "Fact to remember" },
            key: { type: "string", description: "Optional stable key for upsert" },
          },
          required: ["fact"],
        },
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const fact = String(args["fact"] ?? "").trim();
    if (!fact) {
      throwToolError("VALIDATION", "remember_fact requires a non-empty fact");
    }
    const key =
      typeof args["key"] === "string" && args["key"].trim()
        ? args["key"].trim()
        : undefined;
    const record = await this.memory.store({
      kind: "semantic",
      content: fact,
      metadata: key ? { key } : {},
    });
    return { stored: true, id: record.id, content: record.content };
  }
}

export class ForgetFactTool extends BaseTool {
  constructor(private readonly memory: IMemoryStore) {
    super(
      defineToolMeta({
        id: "memory.forget_fact",
        name: "forget_fact",
        category: "Memory",
        tags: ["memory"],
        permissions: ["memory.write"],
        concurrent: false,
        description: "Delete a memory record by id from session memory.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Memory record id" },
          },
          required: ["id"],
        },
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const id = String(args["id"] ?? "").trim();
    if (!id) {
      throwToolError("VALIDATION", "forget_fact requires id");
    }
    if (!this.memory.delete) {
      throwToolError("PROVIDER", "Memory store does not support delete");
    }
    await this.memory.delete(id);
    return { deleted: true, id };
  }
}

export class UpdatePreferenceTool extends BaseTool {
  constructor(private readonly memory: IMemoryStore) {
    super(
      defineToolMeta({
        id: "memory.update_preference",
        name: "update_preference",
        category: "Memory",
        tags: ["preference"],
        permissions: ["memory.write"],
        description:
          "Upsert a user preference (key/value) into session memory.",
        inputSchema: {
          type: "object",
          properties: {
            key: { type: "string", description: "Preference key" },
            value: { type: "string", description: "Preference value" },
          },
          required: ["key", "value"],
        },
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const key = String(args["key"] ?? "").trim();
    const value = String(args["value"] ?? "").trim();
    if (!key || !value) {
      throwToolError("VALIDATION", "update_preference requires key and value");
    }
    const record = await this.memory.store({
      kind: "preference",
      content: `${key}: ${value}`,
      metadata: { key, value },
    });
    return { stored: true, key, value, id: record.id };
  }
}

/** @deprecated alias — prefer update_preference */
export class NotePreferenceTool extends BaseTool {
  constructor(private readonly memory: IMemoryStore) {
    super(
      defineToolMeta({
        id: "memory.note_preference",
        name: "note_preference",
        category: "Memory",
        tags: ["preference", "deprecated"],
        permissions: ["memory.write"],
        description:
          "Stores a short user preference (prefer update_preference for new calls).",
        inputSchema: {
          type: "object",
          properties: {
            key: { type: "string", description: "Preference key" },
            value: { type: "string", description: "Preference value" },
          },
          required: ["key", "value"],
        },
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    return new UpdatePreferenceTool(this.memory).execute(args, context);
  }
}

export class SearchMemoryTool extends BaseTool {
  constructor(private readonly memory: IMemoryStore) {
    super(
      defineToolMeta({
        id: "memory.search",
        name: "search_memory",
        category: "Memory",
        tags: ["memory", "search"],
        permissions: ["memory.read"],
        description: "Search session memory for relevant facts and preferences.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search text" },
            limit: { type: "number", description: "Max results (1-10)" },
          },
          required: ["query"],
        },
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const query = String(args["query"] ?? "").trim();
    if (!query) {
      throwToolError("VALIDATION", "search_memory requires query");
    }
    const limit =
      typeof args["limit"] === "number" && Number.isFinite(args["limit"])
        ? Math.min(10, Math.max(1, Math.trunc(args["limit"])))
        : 5;
    const records = await this.memory.query({ text: query, limit });
    return {
      query,
      count: records.length,
      records: records.map((r) => ({
        id: r.id,
        kind: r.kind,
        content: r.content,
        score: r.score,
      })),
    };
  }
}

export class SessionSummaryTool extends BaseTool {
  constructor(private readonly memory: IMemoryStore) {
    super(
      defineToolMeta({
        id: "memory.session_summary",
        name: "session_summary",
        category: "Memory",
        tags: ["summary"],
        permissions: ["memory.read"],
        description: "Summarize notable items currently in session memory.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max items to include" },
          },
        },
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const limit =
      typeof args["limit"] === "number" && Number.isFinite(args["limit"])
        ? Math.min(20, Math.max(1, Math.trunc(args["limit"])))
        : 8;
    const records = await this.memory.query({ text: "", limit });
    return {
      count: records.length,
      items: records.map((r) => `(${r.kind}) ${r.content}`),
    };
  }
}

export class ConversationSummaryTool extends BaseTool {
  private historyProvider: () => readonly { role: string; content: string }[];

  constructor(
    historyProvider: () => readonly { role: string; content: string }[],
  ) {
    super(
      defineToolMeta({
        id: "memory.conversation_summary",
        name: "conversation_summary",
        category: "Memory",
        tags: ["summary", "conversation"],
        permissions: ["memory.read"],
        description: "Summarize the recent conversation turns in this session.",
        inputSchema: {
          type: "object",
          properties: {
            max_turns: {
              type: "number",
              description: "How many recent turns to include",
            },
          },
        },
      }),
    );
    this.historyProvider = historyProvider;
  }

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const maxTurns =
      typeof args["max_turns"] === "number" && Number.isFinite(args["max_turns"])
        ? Math.min(40, Math.max(2, Math.trunc(args["max_turns"])))
        : 12;
    const history = this.historyProvider().slice(-maxTurns);
    const lines = history.map((m) => `${m.role}: ${m.content.slice(0, 200)}`);
    return { turns: history.length, lines };
  }
}

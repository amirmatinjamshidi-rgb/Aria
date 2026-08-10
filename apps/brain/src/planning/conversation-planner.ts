import type {
  IConversationPlanner,
  ConversationPlan,
  LanguageCode,
  ToolDefinition,
} from "@aria/contracts";

const IMPOSSIBLE_PATTERNS =
  /fly to mars|build a spaceship|hack into|disable safety|control motors directly|کنترل مستقیم موتور/i;

/**
 * Conversation planner: assess feasibility and validate tool calls.
 * Does not hardcode tool names — the catalog is the source of truth.
 */
export class ConversationPlanner implements IConversationPlanner {
  assess(input: {
    readonly text: string;
    readonly language: LanguageCode;
    readonly availableTools: readonly ToolDefinition[];
  }): ConversationPlan {
    if (IMPOSSIBLE_PATTERNS.test(input.text)) {
      return {
        steps: [
          {
            id: "reject-1",
            kind: "reject",
            rationale: "Request is unsafe or outside Aria's capability boundary",
          },
        ],
        allowTools: false,
        rejected: true,
        rejectionReason:
          input.language === "fa"
            ? "این درخواست خارج از توانایی‌های ایمن آریاست."
            : "That request is outside Aria's safe capabilities.",
      };
    }

    const categories = new Set(
      input.availableTools.map((t) => inferCategoryHint(t)),
    );
    const steps: ConversationPlan["steps"][number][] = [
      {
        id: "respond-1",
        kind: "respond",
        rationale: "Default path is a direct natural-language reply",
      },
    ];

    if (input.availableTools.length > 0) {
      steps.push({
        id: "tools-available",
        kind: "tool",
        rationale: `Catalog exposes ${input.availableTools.length} tools; LLM selects`,
        categoryHint: [...categories].slice(0, 8).join(","),
      });
    }

    return {
      steps,
      allowTools: input.availableTools.length > 0,
      rejected: false,
    };
  }

  validateToolCalls(
    toolCalls: readonly {
      readonly id: string;
      readonly name: string;
      readonly arguments: Record<string, unknown>;
    }[],
    availableTools: readonly ToolDefinition[],
  ): {
    readonly accepted: readonly {
      readonly id: string;
      readonly name: string;
      readonly arguments: Record<string, unknown>;
    }[];
    readonly rejected: readonly {
      readonly name: string;
      readonly reason: string;
      readonly code?: string;
    }[];
  } {
    const known = new Set(availableTools.map((t) => t.name));
    const accepted: {
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }[] = [];
    const rejected: { name: string; reason: string; code?: string }[] = [];
    const seen = new Set<string>();

    for (const call of toolCalls) {
      const dedupeKey = `${call.name}:${stableArgsKey(call.arguments)}`;
      if (seen.has(dedupeKey)) {
        rejected.push({
          name: call.name,
          reason: "Duplicate tool call in the same turn",
          code: "DUPLICATE",
        });
        continue;
      }
      seen.add(dedupeKey);

      if (!known.has(call.name)) {
        rejected.push({
          name: call.name,
          reason: "Unknown tool",
          code: "UNKNOWN_TOOL",
        });
        continue;
      }
      accepted.push(call);
    }

    return { accepted, rejected };
  }
}

function inferCategoryHint(tool: ToolDefinition): string {
  const name = tool.name;
  if (name.startsWith("search_") || name === "web_search" || name === "fetch_page") {
    return "Search";
  }
  if (name.includes("memory") || name.includes("preference") || name.includes("fact") || name.includes("summary")) {
    return "Memory";
  }
  if (name.includes("time")) return "Time";
  if (name.includes("light")) return "SmartHome";
  return "General";
}

function stableArgsKey(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, Object.keys(args).sort());
  } catch {
    return String(args);
  }
}

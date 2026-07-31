import type {
  IConversationPlanner,
  ConversationPlan,
  LanguageCode,
  ToolDefinition,
} from "@aria/contracts";

const IMPOSSIBLE_PATTERNS =
  /fly to mars|build a spaceship|hack into|disable safety|control motors directly|کنترل مستقیم موتور/i;

/**
 * Phase 1 conversation planner: assess feasibility and validate tool calls.
 * Independent of any concrete LLM implementation.
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

    const toolNames = new Set(input.availableTools.map((t) => t.name));
    const steps: ConversationPlan["steps"][number][] = [
      {
        id: "respond-1",
        kind: "respond",
        rationale: "Default path is a direct natural-language reply",
      },
    ];

    if (toolNames.has("get_current_time") && asksForTime(input.text)) {
      steps.push({
        id: "tool-time",
        kind: "tool",
        toolName: "get_current_time",
        rationale: "User asked for the current time",
      });
    }
    if (toolNames.has("set_light") && asksForLight(input.text)) {
      steps.push({
        id: "tool-light",
        kind: "tool",
        toolName: "set_light",
        rationale: "User asked to change a light",
      });
    }
    if (toolNames.has("note_preference") && asksToNote(input.text)) {
      steps.push({
        id: "tool-note",
        kind: "tool",
        toolName: "note_preference",
        rationale: "User asked to remember a preference",
      });
    }

    return {
      steps,
      allowTools: true,
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
    readonly rejected: readonly { readonly name: string; readonly reason: string }[];
  } {
    const known = new Set(availableTools.map((t) => t.name));
    const accepted: {
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }[] = [];
    const rejected: { name: string; reason: string }[] = [];
    const seen = new Set<string>();

    for (const call of toolCalls) {
      const dedupeKey = `${call.name}:${stableArgsKey(call.arguments)}`;
      if (seen.has(dedupeKey)) {
        rejected.push({
          name: call.name,
          reason: "Duplicate tool call in the same turn",
        });
        continue;
      }
      seen.add(dedupeKey);

      if (!known.has(call.name)) {
        rejected.push({ name: call.name, reason: "Unknown tool" });
        continue;
      }
      accepted.push(call);
    }

    return { accepted, rejected };
  }
}

function asksForTime(text: string): boolean {
  return /what time|current time|ساعت|time is it/i.test(text);
}

function asksForLight(text: string): boolean {
  return /light|lamp|چراغ|لامپ| i want to turn on the light| i want to turn off the light| i want to change the light| i want to turn on the light in the living room| i want to turn off the light in the living room| i want to change the light in the living room| i want to turn on the light in the kitchen| i want to turn off the light in the kitchen| i want to change the light in the kitchen| i want to turn on the light in the bedroom| i want to turn off the light in the bedroom| i want to change the light in the bedroom/i.test(text);
}

function asksToNote(text: string): boolean {
  return /remember|prefer|یادداشت|یادت|ترجیح| i prefer|i like| i want to remember| i want to prefer| i want to note| i want to remember this| i want to prefer this| i want to note this/i.test(text);
}

function stableArgsKey(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, Object.keys(args).sort());
  } catch {
    return String(args);
  }
}

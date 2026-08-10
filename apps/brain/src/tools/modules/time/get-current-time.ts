import type { ToolExecutionContext } from "@aria/contracts";
import { BaseTool } from "@aria/tool-runtime";
import { defineToolMeta } from "../../define-tool-meta.js";

export class GetCurrentTimeTool extends BaseTool {
  constructor() {
    super(
      defineToolMeta({
        id: "time.current",
        name: "get_current_time",
        category: "Time",
        tags: ["clock", "datetime"],
        permissions: ["time.read"],
        estimatedLatencyMs: 5,
        timeoutMs: 2_000,
        description:
          "Returns the current date and time in ISO-8601. Optional IANA timezone.",
        inputSchema: {
          type: "object",
          properties: {
            timezone: {
              type: "string",
              description: "IANA timezone, e.g. Asia/Tehran or UTC",
            },
          },
        },
        examples: [
          {
            description: "Current time in Tehran",
            input: { timezone: "Asia/Tehran" },
          },
        ],
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const timezone =
      typeof args["timezone"] === "string" && args["timezone"].length > 0
        ? args["timezone"]
        : undefined;
    const now = new Date();

    let local: string;
    try {
      local = timezone
        ? new Intl.DateTimeFormat("en-GB", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: timezone,
          }).format(now)
        : now.toString();
    } catch {
      local = now.toString();
    }

    return {
      iso: now.toISOString(),
      timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      local,
    };
  }
}

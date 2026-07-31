import type { ITool, ToolDefinition, ToolExecutionContext } from "@aria/contracts";

export class GetCurrentTimeTool implements ITool {
  readonly definition: ToolDefinition = {
    name: "get_current_time",
    description:
      "Returns the current date and time in ISO-8601. Optional IANA timezone.",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "IANA timezone, e.g. Asia/Tehran or UTC",
        },
      },
    },
  };

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

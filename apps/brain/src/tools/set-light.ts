import type { ITool, ToolDefinition, ToolExecutionContext } from "@aria/contracts";

/**
 * Fake smart-home light switch for tool-calling practice.
 * Real Matter/HA integration is Phase 5+.
 */
export class SetLightTool implements ITool {
  private readonly lights = new Map<string, boolean>([
    ["living_room", false],
    ["kitchen", false],
    ["bedroom", false],
  ]);

  readonly definition: ToolDefinition = {
    name: "set_light",
    description: "Turns a named room light on or off (simulated).",
    parameters: {
      type: "object",
      properties: {
        room: {
          type: "string",
          description: "Room id: living_room | kitchen | bedroom",
        },
        on: {
          type: "boolean",
          description: "true = on, false = off",
        },
      },
      required: ["room", "on"],
    },
  };

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const room = String(args["room"] ?? "").trim();
    const on = Boolean(args["on"]);
    if (!this.lights.has(room)) {
      throw new Error(
        `Unknown room "${room}". Use living_room, kitchen, or bedroom.`,
      );
    }
    this.lights.set(room, on);
    return { room, on, status: on ? "on" : "off" };
  }
}

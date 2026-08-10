import type { ToolExecutionContext } from "@aria/contracts";
import { BaseTool } from "@aria/tool-runtime";
import { defineToolMeta } from "../../define-tool-meta.js";

/**
 * Fake smart-home light switch for tool-calling practice.
 */
export class SetLightTool extends BaseTool {
  private readonly lights = new Map<string, boolean>([
    ["living_room", false],
    ["kitchen", false],
    ["bedroom", false],
  ]);

  constructor() {
    super(
      defineToolMeta({
        id: "smarthome.light.set",
        name: "set_light",
        category: "SmartHome",
        tags: ["light", "home"],
        permissions: ["smarthome.light"],
        estimatedLatencyMs: 20,
        timeoutMs: 5_000,
        description: "Turns a named room light on or off (simulated).",
        inputSchema: {
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
      }),
    );
  }

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

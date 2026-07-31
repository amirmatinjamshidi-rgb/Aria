import type {
  ITool,
  IToolRegistry,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from "@aria/contracts";

/**
 * In-process tool registry used by the brain conversation loop.
 * Validates unknown tools and normalizes results for the bus + LLM.
 */
export class ToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, ITool>();

  register(tool: ITool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool already registered: ${tool.definition.name}`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  listDefinitions(): readonly ToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(
    toolCall: {
      readonly id: string;
      readonly name: string;
      readonly arguments: Record<string, unknown>;
    },
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        ok: false,
        error: `Unknown tool: ${toolCall.name}`,
      };
    }

    try {
      const result = await tool.execute(toolCall.arguments, context);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        ok: true,
        result,
      };
    } catch (error: unknown) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

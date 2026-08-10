import type {
  ITool,
  ToolDefinition,
  ToolExecutionContext,
  ToolMetadata,
} from "@aria/contracts";
import { ToolMetadataSchema, toLlmToolDefinition } from "@aria/contracts";

/**
 * Base helper so tools only declare metadata + execute.
 */
export abstract class BaseTool implements ITool {
  readonly metadata: ToolMetadata;

  constructor(metadata: ToolMetadata) {
    this.metadata = ToolMetadataSchema.parse(metadata);
  }

  get definition(): ToolDefinition {
    return toLlmToolDefinition(this.metadata);
  }

  abstract execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown>;
}

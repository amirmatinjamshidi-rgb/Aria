import { ToolRegistry } from "./tool-registry.js";
import { GetCurrentTimeTool } from "./get-current-time.js";
import { NotePreferenceTool } from "./note-preference.js";
import { SetLightTool } from "./set-light.js";

/** Registers the Phase 1 built-in demo tools. */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new GetCurrentTimeTool());
  registry.register(new NotePreferenceTool());
  registry.register(new SetLightTool());
  return registry;
}

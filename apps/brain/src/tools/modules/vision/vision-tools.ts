import type {
  IVisionProvider,
  IVisionSceneStore,
  ToolExecutionContext,
  VisionSceneSnapshot,
} from "@aria/contracts";
import { BaseTool, throwToolError } from "@aria/tool-runtime";
import { defineToolMeta } from "../../define-tool-meta.js";
import type { VisionPortsBag } from "../../../vision/vision-ports.js";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function emptyFrame(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
}

async function resolveScene(
  ports: VisionPortsBag,
  options: { readonly describe?: boolean; readonly peopleOnly?: boolean } = {},
): Promise<VisionSceneSnapshot> {
  const store: IVisionSceneStore = ports.sceneStore;
  const provider: IVisionProvider = ports.provider;
  const latest = store.getLatest();
  const frame = store.getLatestFrame() ?? emptyFrame();

  if (options.describe || !latest) {
    const result = await provider.analyze(frame, {
      detect: true,
      track: true,
      describe: options.describe === true,
    });
    const snapshot: VisionSceneSnapshot = {
      objects: result.objects,
      description: result.description,
      frameId: result.frameId,
      correlationId: `tool-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    store.update(snapshot, frame);
    if (options.peopleOnly) {
      return {
        ...snapshot,
        objects: snapshot.objects.filter((obj) =>
          /person|people|human|man|woman|child/i.test(obj.label),
        ),
      };
    }
    return snapshot;
  }

  if (options.peopleOnly) {
    return {
      ...latest,
      objects: latest.objects.filter((obj) =>
        /person|people|human|man|woman|child/i.test(obj.label),
      ),
    };
  }

  return latest;
}

export class DetectObjectsTool extends BaseTool {
  constructor(private readonly ports: VisionPortsBag) {
    super(
      defineToolMeta({
        id: "vision.detect_objects",
        name: "detect_objects",
        category: "Vision",
        tags: ["vision", "detection", "camera"],
        permissions: ["vision"],
        estimatedLatencyMs: 200,
        timeoutMs: 30_000,
        description:
          "Detect objects in the current camera scene (Gemini or local YOLO).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }),
    );
  }

  async execute(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const scene = await resolveScene(this.ports);
    return {
      count: scene.objects.length,
      objects: scene.objects,
      frameId: scene.frameId,
      timestamp: scene.timestamp,
    };
  }
}

export class DetectPeopleTool extends BaseTool {
  constructor(private readonly ports: VisionPortsBag) {
    super(
      defineToolMeta({
        id: "vision.detect_people",
        name: "detect_people",
        category: "Vision",
        tags: ["vision", "people", "camera"],
        permissions: ["vision"],
        estimatedLatencyMs: 200,
        timeoutMs: 30_000,
        description: "Detect people in the current camera scene.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }),
    );
  }

  async execute(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const scene = await resolveScene(this.ports, { peopleOnly: true });
    return {
      count: scene.objects.length,
      people: scene.objects,
      frameId: scene.frameId,
      timestamp: scene.timestamp,
    };
  }
}

export class DescribeSceneTool extends BaseTool {
  constructor(private readonly ports: VisionPortsBag) {
    super(
      defineToolMeta({
        id: "vision.describe_scene",
        name: "describe_scene",
        category: "Vision",
        tags: ["vision", "vlm", "camera"],
        permissions: ["vision"],
        estimatedLatencyMs: 1500,
        timeoutMs: 60_000,
        description:
          "Describe what the camera sees using an on-demand VLM (Qwen2.5-VL).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }),
    );
  }

  async execute(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const scene = await resolveScene(this.ports, { describe: true });
    return {
      description: scene.description ?? "No description available.",
      objects: scene.objects,
      frameId: scene.frameId,
      timestamp: scene.timestamp,
    };
  }
}

export class FindObjectTool extends BaseTool {
  constructor(private readonly ports: VisionPortsBag) {
    super(
      defineToolMeta({
        id: "vision.find_object",
        name: "find_object",
        category: "Vision",
        tags: ["vision", "search", "camera"],
        permissions: ["vision"],
        estimatedLatencyMs: 200,
        timeoutMs: 30_000,
        description: "Find objects matching a label in the current scene.",
        inputSchema: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Object label to search for, e.g. cup or person",
            },
          },
          required: ["label"],
        },
        examples: [{ description: "Find a cup", input: { label: "cup" } }],
      }),
    );
  }

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    const label = asString(args["label"]);
    if (!label) {
      throwToolError("VALIDATION", "label is required");
    }
    const scene = await resolveScene(this.ports);
    const needle = label.toLowerCase();
    const matches = scene.objects.filter((obj) =>
      obj.label.toLowerCase().includes(needle),
    );
    return {
      label,
      found: matches.length > 0,
      count: matches.length,
      objects: matches,
      frameId: scene.frameId,
      timestamp: scene.timestamp,
    };
  }
}

export function createVisionTools(ports: VisionPortsBag): BaseTool[] {
  return [
    new DetectObjectsTool(ports),
    new DetectPeopleTool(ports),
    new DescribeSceneTool(ports),
    new FindObjectTool(ports),
  ];
}

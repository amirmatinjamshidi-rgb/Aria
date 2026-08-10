import type { AriaEvent, AriaEventTypeName, EventHandler } from "./events.js";
import type {  PluginMetadata } from "./plugin-metadata.js";
import type {
  ChatMessage,
  AudioFormat,
  DetectedObject,
  Goal,
  LanguageCode,
  LlmCompletion,
  MemoryKind,
  MemoryRecord,
  SkillStatus,
  ToolDefinition,
  Transcription,
  VoicePipelineState,
} from "./schemas.js";

export type { PluginFactory, PluginMetadata } from "./plugin-metadata.js";
export type { ToolDefinition } from "./schemas.js";

export * from "./ports/tools.js";
export * from "./ports/search.js";

export interface LlmGenerateOptions {
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly tools?: readonly ToolDefinition[];
  readonly languageHint?: LanguageCode;
  readonly signal?: AbortSignal;
}

/**
 * Port: Large Language Model provider.
 * Implementations: mock, echo, ollama/qwen, openrouter, cloud adapters.
 */
export interface ILLMProvider {
  readonly metadata: PluginMetadata;
  generate(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): Promise<LlmCompletion>;
  dispose?(): Promise<void>;
}

/**
 * Port: Personality / system-prompt service.
 * Lives outside LLM adapters so tone stays provider-independent.
 */
export interface IPersonalityService {
  buildSystemPrompt(languageHint?: LanguageCode): string;
  describe(): {
    readonly name: string;
    readonly tone: string;
    readonly traits: readonly string[];
  };
}

export interface ConversationPlanStep {
  readonly id: string;
  readonly kind: "respond" | "tool" | "reject";
  readonly toolName?: string;
  readonly rationale: string;
  readonly categoryHint?: string;
}

export interface ConversationPlan {
  readonly steps: readonly ConversationPlanStep[];
  readonly allowTools: boolean;
  readonly rejected: boolean;
  readonly rejectionReason?: string;
}

/**
 * Port: Lightweight conversation planner (Phase 1).
 * Validates / structures tool intent; does not own robot BT/GOAP (Phase 5).
 * Must not hardcode concrete tool names — catalog is the source of truth.
 */
export interface IConversationPlanner {
  /**
   * Soft pre-plan: whether tools are plausible and whether the request is impossible.
   * The LLM still decides the final tool calls.
   */
  assess(input: {
    readonly text: string;
    readonly language: LanguageCode;
    readonly availableTools: readonly ToolDefinition[];
  }): ConversationPlan;

  /**
   * Hard validation of LLM-proposed tool calls before execution.
   * Drops unknown tools and impossible combinations.
   */
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
    readonly rejected: readonly { readonly name: string; readonly reason: string; readonly code?: string }[];
  };
}

export interface SttTranscribeOptions {
  readonly languageHint?: LanguageCode | "auto";
  readonly sampleRateHz?: number;
  readonly beamSize?: number;
  readonly signal?: AbortSignal;
}

/**
 * Port: Speech-to-Text provider (Faster-Whisper, etc.).
 */
export interface ISTTProvider {
  readonly metadata: PluginMetadata;
  transcribe(
    audio: Uint8Array,
    options?: SttTranscribeOptions,
  ): Promise<Transcription>;
  dispose?(): Promise<void>;
}

export interface TtsSynthesizeOptions {
  readonly language: LanguageCode;
  readonly voiceId?: string;
  readonly speakingRate?: number;
  readonly signal?: AbortSignal;
}

/**
 * Port: Text-to-Speech provider (Piper, etc.).
 */
export interface ITTSProvider {
  readonly metadata: PluginMetadata;
  synthesize(
    text: string,
    options: TtsSynthesizeOptions,
  ): Promise<{ audio: Uint8Array; sampleRateHz: number }>;
  dispose?(): Promise<void>;
}

export type AudioChunkHandler = (
  chunk: Uint8Array,
) => void | Promise<void>;

/** Port: continuous PCM microphone capture. */
export interface IAudioSource {
  readonly format: AudioFormat;
  start(handler: AudioChunkHandler, signal: AbortSignal): Promise<void>;
  stop(): Promise<void>;
}

/** Port: cancellable audio output. Barge-in calls stop immediately. */
export interface IAudioPlayback {
  play(
    audio: Uint8Array,
    format: Pick<AudioFormat, "sampleRateHz" | "channels">,
    signal: AbortSignal,
  ): Promise<void>;
  stop(): Promise<void>;
}

export interface VadFrameResult {
  readonly probability: number;
  readonly speechStarted: boolean;
  readonly speechEnded: boolean;
}

/** Port: stateful streaming voice activity detection. */
export interface IVoiceActivityDetector {
  readonly metadata: PluginMetadata;
  process(
    pcm: Uint8Array,
    format: AudioFormat,
    signal?: AbortSignal,
  ): Promise<VadFrameResult>;
  reset(): Promise<void>;
  dispose?(): Promise<void>;
}

export interface VoicePipelineSnapshot {
  readonly state: VoicePipelineState;
  readonly activeCorrelationId?: string;
  readonly startedAt?: string;
}

export interface VisionAnalyzeOptions {
  readonly detect?: boolean;
  readonly segment?: boolean;
  readonly describe?: boolean;
}

export interface VisionAnalyzeResult {
  readonly objects: DetectedObject[];
  readonly description?: string;
}

/**
 * Port: Vision pipeline facade (YOLO / SAM2 / VLM adapters behind it).
 */
export interface IVisionProvider {
  readonly metadata: PluginMetadata;
  analyze(
    image: Uint8Array,
    options?: VisionAnalyzeOptions,
  ): Promise<VisionAnalyzeResult>;
  dispose?(): Promise<void>;
}

export interface MemoryQuery {
  readonly text: string;
  readonly kind?: MemoryKind;
  readonly limit?: number;
}

export interface MemoryStoreInput {
  readonly kind: MemoryKind;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Port: Long-term memory / RAG store (ChromaDB, etc.).
 */
export interface IMemoryStore {
  readonly metadata: PluginMetadata;
  store(input: MemoryStoreInput): Promise<MemoryRecord>;
  query(query: MemoryQuery): Promise<MemoryRecord[]>;
  delete?(id: string): Promise<void>;
  dispose?(): Promise<void>;
}

/**
 * Port: Inter-service message bus.
 * Dev: in-process. Robot tier: NATS (+ ROS2 bridge in robot-api).
 */
export interface IMessageBus {
  publish(event: AriaEvent): Promise<void>;
  subscribe<T extends AriaEvent = AriaEvent>(
    type: AriaEventTypeName | "*",
    handler: EventHandler<T>,
  ): () => void;
  dispose?(): Promise<void>;
}

export interface SkillContext {
  readonly correlationId: string;
  readonly goal: Goal;
  readonly parameters: Record<string, unknown>;
  readonly abortSignal: AbortSignal;
}

export interface SkillResult {
  readonly status: Exclude<SkillStatus, "idle" | "running">;
  readonly detail?: string;
  readonly outputs?: Record<string, unknown>;
}

/**
 * Port: Executable robot / smart-home skill.
 * Planner never knows if this runs in Gazebo or on metal.
 */
export interface IRobotSkill {
  readonly metadata: PluginMetadata;
  readonly skillId: string;
  execute(context: SkillContext): Promise<SkillResult>;
}

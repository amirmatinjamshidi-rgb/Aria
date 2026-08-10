import type { VoicePipelineState } from "@aria/contracts";

const ALLOWED_TRANSITIONS: Record<
  VoicePipelineState,
  readonly VoicePipelineState[]
> = {
  idle: ["listening", "stopping", "error"],
  listening: ["transcribing", "thinking", "stopping", "error"],
  transcribing: ["thinking", "listening", "stopping", "error"],
  thinking: ["speaking", "listening", "stopping", "error"],
  speaking: ["listening", "stopping", "error"],
  stopping: ["idle", "error"],
  error: ["listening", "stopping", "idle"],
};

export class VoiceStateMachine {
  private currentState: VoicePipelineState = "idle";

  get state(): VoicePipelineState {
    return this.currentState;
  }

  transition(next: VoicePipelineState): {
    previous: VoicePipelineState;
    current: VoicePipelineState;
  } {
    const previous = this.currentState;
    if (previous === next) {
      return { previous, current: next };
    }
    if (!ALLOWED_TRANSITIONS[previous].includes(next)) {
      throw new Error(`Invalid voice state transition: ${previous} -> ${next}`);
    }
    this.currentState = next;
    return { previous, current: next };
  }
}

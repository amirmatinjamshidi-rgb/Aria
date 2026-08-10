import { describe, expect, it } from "vitest";
import { VoiceStateMachine } from "./voice-state-machine.js";

describe("VoiceStateMachine", () => {
  it("supports the normal continuous conversation cycle", () => {
    const machine = new VoiceStateMachine();
    machine.transition("listening");
    machine.transition("transcribing");
    machine.transition("thinking");
    machine.transition("speaking");
    machine.transition("listening");
    expect(machine.state).toBe("listening");
  });

  it("rejects invalid transitions", () => {
    const machine = new VoiceStateMachine();
    expect(() => machine.transition("speaking")).toThrow(
      "Invalid voice state transition",
    );
  });

  it("allows barge-in from thinking and speaking", () => {
    const thinking = new VoiceStateMachine();
    thinking.transition("listening");
    thinking.transition("transcribing");
    thinking.transition("thinking");
    thinking.transition("listening");
    expect(thinking.state).toBe("listening");

    const speaking = new VoiceStateMachine();
    speaking.transition("listening");
    speaking.transition("transcribing");
    speaking.transition("thinking");
    speaking.transition("speaking");
    speaking.transition("listening");
    expect(speaking.state).toBe("listening");
  });

  it("allows text turns to skip STT via listening -> thinking", () => {
    const machine = new VoiceStateMachine();
    machine.transition("listening");
    machine.transition("thinking");
    machine.transition("speaking");
    machine.transition("listening");
    expect(machine.state).toBe("listening");
  });
});

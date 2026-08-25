import { describe, expect, it } from "vitest";
import { RemoteAudioPlayback } from "./remote-audio-playback.js";

describe("RemoteAudioPlayback", () => {
  it("forwards a buffered utterance then waits for its duration", async () => {
    const events: string[] = [];
    const playback = new RemoteAudioPlayback();
    playback.setListener((event) => {
      events.push(event.type);
    });
    const pcm = new Uint8Array(320); // 10 ms at 16 kHz s16le
    const started = performance.now();
    await playback.play(
      pcm,
      { sampleRateHz: 16000, channels: 1 },
      new AbortController().signal,
    );
    expect(performance.now() - started).toBeGreaterThanOrEqual(8);
    expect(events).toEqual(["start", "chunk", "stop"]);
  });

  it("stops in-flight playback on barge-in", async () => {
    const playback = new RemoteAudioPlayback();
    const reasons: string[] = [];
    playback.setListener((event) => {
      if (event.type === "stop") {
        reasons.push(event.reason);
      }
    });
    const pcm = new Uint8Array(32000); // 1s at 16 kHz
    const signal = new AbortController();
    const pending = playback.play(
      pcm,
      { sampleRateHz: 16000, channels: 1 },
      signal.signal,
    );
    await playback.stop();
    await pending;
    expect(reasons).toContain("interrupt");
  });

  it("forwards even ~20ms frames even when the source splits samples", async () => {
    const sizes: number[] = [];
    const playback = new RemoteAudioPlayback();
    playback.setListener((event) => {
      if (event.type === "chunk") {
        sizes.push(event.pcm.byteLength);
      }
    });

    async function* chunks(): AsyncGenerator<Uint8Array> {
      yield Uint8Array.from([1]);
      yield Uint8Array.from([2, 3, 4, 5, 6]);
    }

    await playback.playStream(
      { sampleRateHz: 100, channels: 1, chunks: chunks() },
      new AbortController().signal,
    );

    expect(sizes).toEqual([4, 2]);
  });
});

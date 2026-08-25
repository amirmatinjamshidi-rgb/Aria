import { describe, expect, it } from "vitest";
import { SentenceMatcher } from "./sentence-matcher.js";

/** Feed text one character at a time — the worst case for a token stream. */
function pushByChar(matcher: SentenceMatcher, text: string): string[] {
  const out: string[] = [];
  for (const char of text) {
    out.push(...matcher.push(char));
  }
  return out;
}

describe("SentenceMatcher", () => {
  it("emits a sentence as soon as the terminator is confirmed", () => {
    const matcher = new SentenceMatcher();
    expect(matcher.push("Hello there. ")).toEqual(["Hello there."]);
  });

  it("waits for whitespace before splitting", () => {
    const matcher = new SentenceMatcher();
    expect(matcher.push("Hello there.")).toEqual([]);
    expect(matcher.push(" And more")).toEqual(["Hello there."]);
  });

  it("splits identically no matter how deltas are chunked", () => {
    const text = "First one. Second one! Third one? Trailing";
    const whole = new SentenceMatcher().push(text);
    const perChar = pushByChar(new SentenceMatcher(), text);
    expect(perChar).toEqual(whole);
    expect(whole).toEqual(["First one.", "Second one!", "Third one?"]);
  });

  it("keeps decimals and domains intact", () => {
    const matcher = new SentenceMatcher();
    const sentences = matcher.push("It costs 3.50 at example.com today. Next");
    expect(sentences).toEqual(["It costs 3.50 at example.com today."]);
  });

  it("does not split on common abbreviations", () => {
    const matcher = new SentenceMatcher();
    expect(matcher.push("Ask Dr. Smith about it. Then wait")).toEqual([
      "Ask Dr. Smith about it.",
    ]);
  });

  it("keeps terminator runs with their sentence", () => {
    const matcher = new SentenceMatcher();
    expect(matcher.push("Really?! Yes... Done")).toEqual([
      "Really?!",
      "Yes...",
    ]);
  });

  it("segments Persian punctuation", () => {
    const matcher = new SentenceMatcher();
    expect(matcher.push("سلام حال شما چطور است؟ بله ")).toEqual([
      "سلام حال شما چطور است؟",
    ]);
  });

  it("releases short leading fragments immediately for fast first audio", () => {
    const matcher = new SentenceMatcher();
    expect(matcher.push("Ok. Here is the long answer for you. ")).toEqual([
      "Ok.",
      "Here is the long answer for you.",
    ]);
  });

  it("breaks at a word boundary when no terminator arrives", () => {
    const matcher = new SentenceMatcher({ maxChars: 20 });
    const sentences = matcher.push("one two three four five six seven");
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toBe("one two three four");
    expect(matcher.flush()).toEqual(["five six seven"]);
  });

  it("flushes the trailing partial sentence", () => {
    const matcher = new SentenceMatcher();
    matcher.push("Complete one. Partial tail");
    expect(matcher.flush()).toEqual(["Partial tail"]);
    expect(matcher.flush()).toEqual([]);
  });

  it("emits a terminator-less turn on flush", () => {
    const matcher = new SentenceMatcher();
    expect(matcher.push("no terminator here")).toEqual([]);
    expect(matcher.flush()).toEqual(["no terminator here"]);
  });

  it("preserves the full text across a turn", () => {
    const text =
      "Aria is online. She can see the screen, hear you, and answer! " +
      "Ask her anything? Sure.";
    const matcher = new SentenceMatcher();
    const all = [...pushByChar(matcher, text), ...matcher.flush()];
    expect(all.join(" ")).toBe(text.trim());
  });
});

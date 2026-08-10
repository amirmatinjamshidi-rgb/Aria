import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  parseReplLine,
} from "../src/cli/repl-commands.js";

describe("REPL command parsing", () => {
  it("detects Persian vs English in auto mode", () => {
    expect(detectLanguage("Hello there", "auto")).toBe("en");
    expect(detectLanguage("سلام آریا", "auto")).toBe("fa");
    expect(detectLanguage("سلام", "en")).toBe("en");
  });

  it("parses slash commands", () => {
    expect(parseReplLine("")).toEqual({ kind: "empty" });
    expect(parseReplLine("/exit")).toEqual({ kind: "exit" });
    expect(parseReplLine("quit")).toEqual({ kind: "exit" });
    expect(parseReplLine("/clear")).toEqual({ kind: "clear" });
    expect(parseReplLine("/metrics")).toEqual({ kind: "metrics" });
    expect(parseReplLine("/lang fa")).toEqual({ kind: "lang", mode: "fa" });
    expect(parseReplLine("/lang auto")).toEqual({ kind: "lang", mode: "auto" });
  });

  it("treats unknown /lang as help and plain text as chat", () => {
    expect(parseReplLine("/lang xx")).toEqual({ kind: "help" });
    expect(parseReplLine("What time is it?")).toEqual({
      kind: "chat",
      text: "What time is it?",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  detectTextLanguage,
  resolveSttLanguageHint,
  resolveTtsLanguage,
} from "./language.js";

describe("voice language helpers", () => {
  it("detects Persian script in auto mode", () => {
    expect(detectTextLanguage("سلام", "auto")).toBe("fa");
    expect(detectTextLanguage("hello", "auto")).toBe("en");
  });

  it("respects forced language mode", () => {
    expect(detectTextLanguage("hello", "fa")).toBe("fa");
    expect(detectTextLanguage("سلام", "en")).toBe("en");
  });

  it("maps language mode to STT hints", () => {
    expect(resolveSttLanguageHint("auto")).toBe("auto");
    expect(resolveSttLanguageHint("fa")).toBe("fa");
  });

  it("forces Ganji when reply text contains Persian script", () => {
    expect(resolveTtsLanguage("en", "پاسخ")).toBe("fa");
    expect(resolveTtsLanguage("fa", "hello")).toBe("fa");
  });
});

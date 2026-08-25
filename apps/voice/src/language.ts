import type { LanguageCode } from "@aria/contracts";

const HAS_PERSIAN = /[\u0600-\u06FF]/;

export type LanguageMode = LanguageCode | "auto";

/** Map user language mode to Faster-Whisper hint. */
export function resolveSttLanguageHint(
  mode: LanguageMode,
): LanguageCode | "auto" {
  if (mode === "auto") {
    return "auto";
  }
  return mode;
}

/**
 * Pick TTS voice language. Reply metadata wins unless the text clearly
 * contains Persian script (belt-and-suspenders for STT misdetect).
 */
export function resolveTtsLanguage(
  replyLanguage: LanguageCode,
  text: string,
): LanguageCode {
  if (HAS_PERSIAN.test(text)) {
    return "fa";
  }
  return replyLanguage;
}

/** Detect chat/typed language when mode is auto. */
export function detectTextLanguage(
  text: string,
  mode: LanguageMode = "auto",
): LanguageCode {
  if (mode === "en" || mode === "fa") {
    return mode;
  }
  return HAS_PERSIAN.test(text) ? "fa" : "en";
}

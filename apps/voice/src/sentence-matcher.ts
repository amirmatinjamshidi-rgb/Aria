/**
 * Incremental sentence segmentation for LLM token streams.
 *
 * TTS quality and latency pull in opposite directions: Piper needs a whole
 * clause to get prosody right, but waiting for the full turn wastes seconds.
 * Sentences are the compromise, so this buffers deltas and releases text as
 * soon as a terminator is confirmed.
 */

/**
 * A sentence ends at `.`/`?`/`!` (plus their Persian/Arabic and full-width
 * equivalents) followed by whitespace. Requiring the trailing whitespace is
 * what makes `3.5` and `google.com` safe: mid-token periods have no space
 * after them, so the buffer keeps growing instead of splitting.
 */
const TERMINATORS = /[.?!؟…。！？]/;

/** Abbreviations whose trailing period is not a sentence end. */
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "eg",
  "ie",
  "approx",
  "no",
  "fig",
  "al",
]);

export interface SentenceMatcherOptions {
  /**
   * Release a pending chunk even without a terminator once it reaches this many
   * characters, so a run-on answer still starts speaking promptly.
   */
  readonly maxChars?: number;
}

export class SentenceMatcher {
  private buffer = "";
  private readonly maxChars: number;

  constructor(options: SentenceMatcherOptions = {}) {
    this.maxChars = options.maxChars ?? 240;
  }

  /** Feed a token delta; returns whatever complete sentences it completed. */
  push(delta: string): string[] {
    this.buffer += delta;
    const sentences: string[] = [];

    for (;;) {
      const cut = this.findCut();
      if (cut === undefined) {
        break;
      }
      const candidate = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut);
      if (candidate.length > 0) {
        sentences.push(candidate);
      }
    }

    return sentences;
  }

  /** Emit the trailing partial sentence at end of turn. */
  flush(): string[] {
    const tail = this.buffer.trim();
    this.buffer = "";
    return tail.length > 0 ? [tail] : [];
  }

  /**
   * Index to split at, or `undefined` while the buffer is still incomplete.
   * A terminator only counts once a following character has arrived, otherwise
   * a delta ending exactly on "." would split before we can tell whether the
   * next character is a space or a digit.
   */
  private findCut(): number | undefined {
    for (let index = 0; index < this.buffer.length - 1; index += 1) {
      if (!TERMINATORS.test(this.buffer[index] ?? "")) {
        continue;
      }

      // Absorb runs like "?!" or "..." so they stay with the sentence.
      let end = index;
      while (
        end + 1 < this.buffer.length &&
        TERMINATORS.test(this.buffer[end + 1] ?? "")
      ) {
        end += 1;
      }
      if (end + 1 >= this.buffer.length) {
        return undefined;
      }
      if (!/\s/.test(this.buffer[end + 1] ?? "")) {
        continue;
      }
      if (this.isAbbreviation(end)) {
        continue;
      }
      // Short leading fragments like "Sure." are released too: getting any
      // audio out early matters more than avoiding a small synthesis call.
      return end + 1;
    }

    if (this.buffer.length >= this.maxChars) {
      // No terminator in sight — break at the last space so we never split a
      // word, which would make Piper mispronounce both halves.
      const space = this.buffer.lastIndexOf(" ", this.maxChars);
      return space > 0 ? space + 1 : this.maxChars;
    }

    return undefined;
  }

  private isAbbreviation(terminatorIndex: number): boolean {
    if (this.buffer[terminatorIndex] !== ".") {
      return false;
    }
    let start = terminatorIndex;
    while (start > 0 && /[A-Za-z]/.test(this.buffer[start - 1] ?? "")) {
      start -= 1;
    }
    const word = this.buffer.slice(start, terminatorIndex).toLowerCase();
    return word.length > 0 && ABBREVIATIONS.has(word);
  }
}

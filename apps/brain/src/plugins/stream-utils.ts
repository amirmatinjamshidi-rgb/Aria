const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";
const OPEN_RE = /<think>/i;
const CLOSE_RE = /<\/think>/i;

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Length of the longest suffix of `text` that is a proper prefix of `tag`.
 * Used to hold back bytes that might turn into a tag once more text arrives.
 */
function partialTagTailLength(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (equalsIgnoreCase(text.slice(text.length - length), tag.slice(0, length))) {
      return length;
    }
  }
  return 0;
}

/**
 * Strips `<think>…</think>` reasoning blocks from a token stream.
 *
 * Non-streaming adapters can regex the whole completion, but here a tag can
 * straddle two deltas, so open/close state and partial tags carry over between
 * `push` calls.
 */
export class ThinkTagFilter {
  private buffer = "";
  private inside = false;

  push(chunk: string): string {
    this.buffer += chunk;
    let output = "";

    for (;;) {
      if (this.inside) {
        const close = CLOSE_RE.exec(this.buffer);
        if (!close) {
          // Discard suppressed text, but keep a possible partial closing tag.
          const keep = partialTagTailLength(this.buffer, CLOSE_TAG);
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          return output;
        }
        this.buffer = this.buffer.slice(close.index + close[0].length);
        this.inside = false;
        continue;
      }

      const open = OPEN_RE.exec(this.buffer);
      if (!open) {
        const keep = partialTagTailLength(this.buffer, OPEN_TAG);
        output += this.buffer.slice(0, this.buffer.length - keep);
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        return output;
      }

      output += this.buffer.slice(0, open.index);
      this.buffer = this.buffer.slice(open.index + open[0].length);
      this.inside = true;
    }
  }

  /** Emit whatever is held back. An unterminated `<think>` block is dropped. */
  flush(): string {
    const output = this.inside ? "" : this.buffer;
    this.buffer = "";
    this.inside = false;
    return output;
  }
}

/**
 * Splits finished text into word-sized deltas so offline adapters expose the
 * same incremental shape as a real streaming backend.
 */
export function* iterateTextDeltas(text: string): Generator<string> {
  for (const part of text.match(/\S+\s*/g) ?? []) {
    yield part;
  }
}

/**
 * Decodes a `fetch` response body into newline-delimited text lines.
 * Handles multi-byte characters and records split across TCP chunks.
 */
export async function* iterateResponseLines(
  response: Response,
): AsyncGenerator<string> {
  const body = response.body;
  if (!body) {
    throw new Error("Response body is not readable — cannot stream tokens");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  // Node's ReadableStream is async-iterable; the DOM lib types are not, so read
  // through the reader for portability across both type surfaces.
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) {
          yield line;
        }
        newline = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    const trailing = buffer.trim();
    if (trailing.length > 0) {
      yield trailing;
    }
  } finally {
    reader.releaseLock();
    // Abort mid-stream (barge-in) must not leave the socket half-open.
    await body.cancel().catch(() => undefined);
  }
}

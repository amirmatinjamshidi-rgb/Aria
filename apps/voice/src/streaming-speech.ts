import type {
  ITTSProvider,
  LanguageCode,
  PcmAudioStream,
} from "@aria/contracts";

/** One speakable sentence plus the voice it should be spoken with. */
export interface SpeechSentence {
  readonly text: string;
  readonly language: LanguageCode;
}

/**
 * Async handoff between the delta subscriber (producer) and the synthesizer
 * (consumer). Unbounded by design: sentences are small, arrive at LLM speed, and
 * dropping one would silently truncate the answer.
 */
export class SentenceQueue implements AsyncIterable<SpeechSentence> {
  private readonly items: SpeechSentence[] = [];
  private waiting?: {
    readonly resolve: (result: IteratorResult<SpeechSentence>) => void;
    readonly reject: (error: Error) => void;
  };
  private closed = false;
  private failure?: Error;

  push(sentence: SpeechSentence): void {
    if (this.closed) {
      return;
    }
    const waiting = this.waiting;
    if (waiting) {
      this.waiting = undefined;
      waiting.resolve({ value: sentence, done: false });
      return;
    }
    this.items.push(sentence);
  }

  /** No more sentences; consumers finish after draining what is buffered. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const waiting = this.waiting;
    if (waiting) {
      this.waiting = undefined;
      waiting.resolve({ value: undefined, done: true });
    }
  }

  /** Abort the turn: buffered sentences are dropped and consumers throw. */
  fail(error: Error): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.failure = error;
    this.items.length = 0;
    const waiting = this.waiting;
    if (waiting) {
      this.waiting = undefined;
      waiting.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SpeechSentence> {
    return {
      next: (): Promise<IteratorResult<SpeechSentence>> => {
        const buffered = this.items.shift();
        if (buffered !== undefined) {
          return Promise.resolve({ value: buffered, done: false });
        }
        if (this.failure) {
          return Promise.reject(this.failure);
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        if (this.waiting) {
          return Promise.reject(
            new Error("SentenceQueue supports a single consumer"),
          );
        }
        return new Promise<IteratorResult<SpeechSentence>>(
          (resolve, reject) => {
            this.waiting = { resolve, reject };
          },
        );
      },
    };
  }
}

export interface SpeechStreamOptions {
  readonly tts: ITTSProvider;
  readonly sentences: AsyncIterable<SpeechSentence>;
  readonly signal: AbortSignal;
  readonly speakingRate?: number;
  readonly onSentence?: (sentence: SpeechSentence) => void;
  readonly onWarning?: (message: string) => void;
}

/**
 * Splices per-sentence Piper streams into one PCM stream for the whole turn.
 *
 * Resolves as soon as the first sentence's format is known so playback can open
 * a single sink up front; returns `undefined` when the turn produced no speakable
 * text. Synthesis of sentence N+1 is started before N finishes playing, which is
 * what keeps the seam between sentences inaudible.
 */
export async function openSpeechStream(
  options: SpeechStreamOptions,
): Promise<PcmAudioStream | undefined> {
  const { tts, sentences, signal, speakingRate, onSentence, onWarning } =
    options;
  const synthesizeStream = tts.synthesizeStream?.bind(tts);
  if (!synthesizeStream) {
    throw new Error(
      `TTS provider ${tts.metadata.id} does not support streaming synthesis`,
    );
  }

  const iterator = sentences[Symbol.asyncIterator]();

  const pullNext = async (): Promise<PcmAudioStream | undefined> => {
    for (;;) {
      if (signal.aborted) {
        return undefined;
      }
      const next = await iterator.next();
      if (next.done === true) {
        return undefined;
      }
      const sentence: SpeechSentence = {
        text: next.value.text.trim(),
        language: next.value.language,
      };
      if (sentence.text.length === 0) {
        continue;
      }
      onSentence?.(sentence);
      return await synthesizeStream(sentence.text, {
        language: sentence.language,
        speakingRate,
        signal,
      });
    }
  };

  const first = await pullNext();
  if (!first) {
    return undefined;
  }

  async function* chunks(head: PcmAudioStream): AsyncGenerator<Uint8Array> {
    let current = head;
    for (;;) {
      // Kick off the next synthesis *before* draining the current sentence so
      // Piper works while ffplay is still consuming the previous one.
      const upcoming = pullNext();
      try {
        for await (const chunk of current.chunks) {
          if (signal.aborted) {
            break;
          }
          yield chunk;
        }
      } catch (error: unknown) {
        // Don't leak the in-flight synthesis if this sentence blows up.
        void upcoming.catch(() => undefined);
        throw error;
      }

      const next = await upcoming;
      if (!next || signal.aborted) {
        return;
      }
      if (next.sampleRateHz !== head.sampleRateHz) {
        // The sink was opened at the head rate, so a different-rate voice would
        // play at the wrong pitch. Stopping is worse than a pitch shift only if
        // it truncates the answer, so warn and keep going.
        onWarning?.(
          `sentence sample rate ${next.sampleRateHz} differs from stream ` +
            `rate ${head.sampleRateHz}; audio may sound off-pitch`,
        );
      }
      current = next;
    }
  }

  return {
    sampleRateHz: first.sampleRateHz,
    channels: 1,
    chunks: chunks(first),
  };
}

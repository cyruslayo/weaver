import type { JsonlDecoderOptions, JsonlDecodeEvent } from "./types.js";

const DEFAULT_MAX_FRAME_CHARACTERS = 1_048_576;

/** Incrementally frames newline-delimited text and parses each frame as JSON. */
export class JsonlDecoder {
  readonly #maxFrameCharacters: number;
  #buffer = "";
  #discarding = false;
  #frame = 1;

  constructor(options: JsonlDecoderOptions = {}) {
    const limit = options.maxFrameCharacters ?? DEFAULT_MAX_FRAME_CHARACTERS;
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError("maxFrameCharacters must be a positive safe integer");
    }
    this.#maxFrameCharacters = limit;
  }

  push(chunk: string): JsonlDecodeEvent[] {
    const events: JsonlDecodeEvent[] = [];

    for (const character of chunk) {
      if (character === "\n") {
        if (!this.#discarding) events.push(this.#parseBufferedFrame());
        this.#buffer = "";
        this.#discarding = false;
        this.#frame += 1;
        continue;
      }

      if (this.#discarding) continue;
      this.#buffer += character;

      // A final CR may be the CRLF framing character. Defer deciding whether
      // that one character counts until the following character arrives.
      const possibleFramingCr = this.#buffer.endsWith("\r") ? 1 : 0;
      if (this.#buffer.length - possibleFramingCr > this.#maxFrameCharacters) {
        events.push({
          ok: false,
          error: {
            code: "FRAME_TOO_LARGE",
            frame: this.#frame,
            maxFrameCharacters: this.#maxFrameCharacters,
          },
        });
        this.#buffer = "";
        this.#discarding = true;
      }
    }

    return events;
  }

  /**
   * Parses an unterminated final frame, if present, and clears stream state.
   * Invalid/incomplete final JSON produces INVALID_JSON. An oversized frame
   * already being discarded produces no second error.
   */
  finish(): JsonlDecodeEvent[] {
    if (this.#discarding) {
      this.#buffer = "";
      this.#discarding = false;
      this.#frame += 1;
      return [];
    }
    if (this.#buffer.length === 0) return [];

    const event = this.#parseBufferedFrame(false);
    this.#buffer = "";
    this.#frame += 1;
    return [event];
  }

  /** Clears buffered input and restarts frame numbering at 1. */
  reset(): void {
    this.#buffer = "";
    this.#discarding = false;
    this.#frame = 1;
  }

  #parseBufferedFrame(stripFramingCr = true): JsonlDecodeEvent {
    const text = stripFramingCr && this.#buffer.endsWith("\r")
      ? this.#buffer.slice(0, -1)
      : this.#buffer;

    if (text.length > this.#maxFrameCharacters) {
      return {
        ok: false,
        error: {
          code: "FRAME_TOO_LARGE",
          frame: this.#frame,
          maxFrameCharacters: this.#maxFrameCharacters,
        },
      };
    }

    try {
      return { ok: true, value: JSON.parse(text) as unknown, frame: this.#frame };
    } catch {
      return { ok: false, error: { code: "INVALID_JSON", frame: this.#frame } };
    }
  }
}

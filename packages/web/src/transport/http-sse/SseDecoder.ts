type SseEvent = { type?: string; data: string };
type SseDecodeResult = { events: SseEvent[]; oversized: number };

/** Private, bounded SSE field decoder. EOF deliberately does not dispatch. */
export class SseDecoder {
  readonly #limit: number;
  readonly #encoder = new TextEncoder();
  #line = "";
  #pendingCr = false;
  #data: string[] = [];
  #dataBytes = 0;
  #type: string | undefined;
  #discarding = false;
  #discardLineNonempty = false;

  constructor(limit: number) { this.#limit = limit; }

  push(text: string): SseDecodeResult {
    const result: SseDecodeResult = { events: [], oversized: 0 };
    for (const character of text) {
      if (this.#pendingCr) {
        this.#pendingCr = false;
        if (character === "\n") continue;
      }
      if (character === "\r") { this.#consumeLine(result); this.#pendingCr = true; continue; }
      if (character === "\n") { this.#consumeLine(result); continue; }
      if (this.#discarding) { this.#discardLineNonempty = true; continue; }
      this.#line += character;
      // Bound field overhead while allowing the `data:` prefix outside the data-byte limit.
      if (this.#line.length > this.#limit + 1_024) this.#oversize(result, true);
    }
    return result;
  }

  finish(): void { this.#reset(); this.#line = ""; this.#pendingCr = false; }

  #consumeLine(result: SseDecodeResult): void {
    if (this.#discarding) {
      if (!this.#discardLineNonempty) this.#reset();
      this.#discardLineNonempty = false;
      this.#line = "";
      return;
    }
    const line = this.#line; this.#line = "";
    if (line === "") {
      if (this.#data.length > 0) result.events.push({ ...(this.#type === undefined ? {} : { type: this.#type }), data: this.#data.join("\n") });
      this.#reset();
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.#type = value;
    if (field === "data") {
      const bytes = this.#encoder.encode(value).byteLength + (this.#data.length === 0 ? 0 : 1);
      if (this.#dataBytes + bytes > this.#limit) { this.#oversize(result, false); return; }
      this.#data.push(value); this.#dataBytes += bytes;
    }
  }

  #oversize(result: SseDecodeResult, insideLine: boolean): void { result.oversized += 1; this.#discarding = true; this.#discardLineNonempty = insideLine; this.#line = ""; this.#data = []; this.#dataBytes = 0; this.#type = undefined; }
  #reset(): void { this.#discarding = false; this.#discardLineNonempty = false; this.#data = []; this.#dataBytes = 0; this.#type = undefined; }
}

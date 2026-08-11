type SseEvent = { type?: string; data: string; lastEventId: string };
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
  #lastEventId = "";
  #pendingEventId: string | undefined;
  #hasField = false;
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
      if (this.#line.length > this.#limit + 1_024) this.#oversize(result, true);
    }
    return result;
  }

  finish(): void { this.#resetEvent(); this.#line = ""; this.#pendingCr = false; }

  #consumeLine(result: SseDecodeResult): void {
    if (this.#discarding) {
      if (!this.#discardLineNonempty) this.#resetEvent();
      this.#discardLineNonempty = false;
      this.#line = "";
      return;
    }
    const line = this.#line; this.#line = "";
    if (line === "") {
      if (this.#pendingEventId !== undefined) this.#lastEventId = this.#pendingEventId;
      if (this.#hasField) result.events.push({ ...(this.#type === undefined ? {} : { type: this.#type }), data: this.#data.join("\n"), lastEventId: this.#lastEventId });
      this.#resetEvent();
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") { this.#type = value; this.#hasField = true; }
    if (field === "id" && !value.includes("\0")) { this.#pendingEventId = value; this.#hasField = true; }
    if (field === "data") {
      this.#hasField = true;
      const bytes = this.#encoder.encode(value).byteLength + (this.#data.length === 0 ? 0 : 1);
      if (this.#dataBytes + bytes > this.#limit) { this.#oversize(result, false); return; }
      this.#data.push(value); this.#dataBytes += bytes;
    }
    // `retry` and unknown fields are deliberately ignored.
  }

  #oversize(result: SseDecodeResult, insideLine: boolean): void { result.oversized += 1; this.#discarding = true; this.#discardLineNonempty = insideLine; this.#line = ""; this.#data = []; this.#dataBytes = 0; this.#type = undefined; this.#pendingEventId = undefined; this.#hasField = false; }
  #resetEvent(): void { this.#discarding = false; this.#discardLineNonempty = false; this.#data = []; this.#dataBytes = 0; this.#type = undefined; this.#pendingEventId = undefined; this.#hasField = false; }
}

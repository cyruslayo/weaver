import type { JsonlDecodeError } from "./errors.js";

export interface JsonlDecoderOptions {
  /** Maximum JavaScript string characters allowed in one frame. Defaults to 1 Mi characters. */
  maxFrameCharacters?: number;
}

export type JsonlDecodeEvent =
  | { ok: true; value: unknown; frame: number }
  | { ok: false; error: JsonlDecodeError };

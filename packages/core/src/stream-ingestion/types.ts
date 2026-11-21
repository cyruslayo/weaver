import type { MessageProcessorError, MessageProcessorSuccess } from "../message-processor/index.js";
import type { JsonlDecodeError } from "../transport/jsonl/index.js";
import type { WeaverRuntime } from "../runtime/index.js";

export interface A2UIV10StreamIngestionConfig {
  /** Runtime that receives each complete decoded A2UI value. */
  runtime: WeaverRuntime;
  /** Passed to JsonlDecoder. Defaults to its standard frame limit. */
  maxFrameCharacters?: number;
}

export type A2UIV10StreamIngestionError = JsonlDecodeError | MessageProcessorError;

export type A2UIV10StreamIngestionEvent =
  | { ok: true; frame: number; value: MessageProcessorSuccess }
  | { ok: false; frame: number; error: A2UIV10StreamIngestionError };

export interface A2UIV10StreamIngestion {
  /** Decodes and applies every complete frame found in this chunk. */
  push(chunk: string): A2UIV10StreamIngestionEvent[];
  /** Processes one valid unterminated final frame, if present. */
  finish(): A2UIV10StreamIngestionEvent[];
  /** Clears decoder state without changing runtime state. */
  reset(): void;
}

import type { MessageProcessorError, MessageProcessorSuccess } from "../message-processor/index.js";
import type { JsonlDecodeError } from "../transport/jsonl/index.js";
import type { WeaverRuntime } from "../runtime/index.js";

export interface A2UIV091StreamIngestionConfig {
  /** Runtime that receives each complete decoded A2UI value. */
  runtime: WeaverRuntime;
  /** Passed to JsonlDecoder. Defaults to its standard frame limit. */
  maxFrameCharacters?: number;
}

export type A2UIV091StreamIngestionError = JsonlDecodeError | MessageProcessorError;

export type A2UIV091StreamIngestionEvent =
  | { ok: true; frame: number; value: MessageProcessorSuccess }
  | { ok: false; frame: number; error: A2UIV091StreamIngestionError };

export interface A2UIV091StreamIngestion {
  /** Decodes and applies every complete frame found in this chunk. */
  push(chunk: string): A2UIV091StreamIngestionEvent[];
  /** Processes one valid unterminated final frame, if present. */
  finish(): A2UIV091StreamIngestionEvent[];
  /** Clears decoder state without changing runtime state. */
  reset(): void;
}

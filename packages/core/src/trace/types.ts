import type { JsonValue } from "../protocol/index.js";
import type { A2UIV091StreamIngestionEvent } from "../stream-ingestion/index.js";
import type { WeaverRuntimeObserver } from "../runtime/index.js";

export const WEAVER_TRACE_FORMAT = "weaver-trace";
export const WEAVER_TRACE_VERSION = 1;

/**
 * - `message`: a value passed to `WeaverRuntime.process()`, valid or not.
 * - `frame-error`: a JSONL frame that failed to decode, so it never reached
 *   the runtime.
 * - `input`: a `WeaverRuntime.writeInput()` call.
 * - `action`: a `WeaverRuntime.dispatchAction()` call.
 */
export type WeaverTraceEntryKind = "message" | "frame-error" | "input" | "action";

export type WeaverTraceOutcome =
  | { ok: true; summary: JsonValue }
  | { ok: false; error: JsonValue };

export interface WeaverTraceEntry {
  /** 1-based and strictly increasing. Gaps show dropped entries. */
  seq: number;
  /** ISO 8601 UTC timestamp taken from the recorder's clock. */
  at: string;
  kind: WeaverTraceEntryKind;
  /**
   * The recorded input. For `message` it is the value given to process(). For
   * `input` and `action` it is the request. For `frame-error` it is the chunk
   * that was pushed, which may hold other frames too. Absent when unknown.
   */
  input?: JsonValue;
  outcome: WeaverTraceOutcome;
}

export interface WeaverTrace {
  format: typeof WEAVER_TRACE_FORMAT;
  version: typeof WEAVER_TRACE_VERSION;
  /** True when the oldest entries were dropped to respect maxEntries. */
  truncated: boolean;
  entries: WeaverTraceEntry[];
}

export interface WeaverTraceRecorderOptions {
  /** Maximum retained entries. Defaults to 5000. Must be a positive safe integer. */
  maxEntries?: number;
  now?: () => Date;
}

export interface WeaverTraceRecorder {
  /** Pass into WeaverRuntimeConfig.observer. Records message, input and action events. */
  observer: WeaverRuntimeObserver;
  /**
   * Records JSONL decode failures only. Runtime failures are already recorded
   * by the observer, so they are skipped here to avoid duplicates. Call it
   * after each push() or finish() so entries stay in order.
   */
  recordIngestion(
    events: readonly A2UIV091StreamIngestionEvent[],
    chunk?: string,
  ): void;
  /** Returns a defensive copy of the current trace. */
  getTrace(): WeaverTrace;
  /** Removes all entries, clears truncated, and restarts seq at 1. */
  clear(): void;
}

export type WeaverTraceParseError =
  | { code: "WRONG_FORMAT"; format: unknown }
  | { code: "UNSUPPORTED_VERSION"; version: unknown }
  | { code: "MALFORMED_TRACE"; path: string; reason: string };

export type WeaverTraceParseResult =
  | { ok: true; value: WeaverTrace }
  | { ok: false; error: WeaverTraceParseError };

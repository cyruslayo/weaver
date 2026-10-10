import type { JsonValue } from "../protocol/index.js";
import type { JsonlDecodeError } from "../transport/jsonl/index.js";
import type { WeaverRuntimeEvent } from "../runtime/index.js";
import {
  WEAVER_TRACE_FORMAT,
  WEAVER_TRACE_VERSION,
  type WeaverTrace,
  type WeaverTraceEntry,
  type WeaverTraceEntryKind,
  type WeaverTraceOutcome,
  type WeaverTraceRecorder,
  type WeaverTraceRecorderOptions,
} from "./types.js";

const DEFAULT_MAX_ENTRIES = 5000;

const FRAME_ERROR_CODES: ReadonlySet<string> = new Set<JsonlDecodeError["code"]>([
  "INVALID_JSON",
  "FRAME_TOO_LARGE",
]);

/**
 * Returns a JSON-safe copy. Values that cannot be serialized, such as cycles,
 * become a marker, so recording never throws on host data.
 */
function jsonCopy(value: unknown): JsonValue {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? null : (JSON.parse(text) as JsonValue);
  } catch {
    return { unserializable: true };
  }
}

/**
 * Creates an in-memory trace recorder. A trace is a development artifact. It
 * holds data-model values and user-typed input. Weaver never sends or persists
 * it, and hosts decide whether to export one.
 */
export function createWeaverTraceRecorder(
  options: WeaverTraceRecorderOptions = {},
): WeaverTraceRecorder {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1)
    throw new RangeError("maxEntries must be a positive safe integer");
  const now = options.now ?? (() => new Date());

  const entries: WeaverTraceEntry[] = [];
  let nextSeq = 1;
  let truncated = false;

  function append(
    kind: WeaverTraceEntryKind,
    outcome: WeaverTraceOutcome,
    input: JsonValue | undefined,
  ): void {
    const at = now().toISOString();
    const entry: WeaverTraceEntry =
      input === undefined
        ? { seq: nextSeq, at, kind, outcome }
        : { seq: nextSeq, at, kind, input, outcome };
    nextSeq += 1;
    entries.push(entry);
    if (entries.length > maxEntries) {
      entries.shift();
      truncated = true;
    }
  }

  function observe(event: WeaverRuntimeEvent): void {
    switch (event.kind) {
      case "message":
        append(
          "message",
          event.result.ok
            ? {
                ok: true,
                summary: {
                  operation: event.result.value.operation,
                  surfaceId: event.result.value.surfaceId,
                },
              }
            : { ok: false, error: jsonCopy(event.result.error) },
          jsonCopy(event.input),
        );
        return;
      case "input":
        append(
          "input",
          event.result.ok
            ? {
                ok: true,
                summary: {
                  surfaceId: event.result.value.surfaceId,
                  sourceComponentId: event.result.value.sourceComponentId,
                  property: event.result.value.property,
                  path: event.result.value.path,
                },
              }
            : { ok: false, error: jsonCopy(event.result.error) },
          jsonCopy(event.request),
        );
        return;
      case "action":
        append(
          "action",
          event.result.ok
            ? { ok: true, summary: jsonCopy(event.result.value) }
            : { ok: false, error: jsonCopy(event.result.error) },
          jsonCopy(event.request),
        );
        return;
    }
  }

  return {
    observer: observe,

    /**
     * Ordering: entries are appended when this is called, after the chunk's
     * messages were already recorded. Within one chunk, frame-error entries
     * therefore follow that chunk's message entries. Order is exact chunk by
     * chunk, so call this after each push() or finish().
     */
    recordIngestion(events, chunk) {
      for (const event of events) {
        if (event.ok || !FRAME_ERROR_CODES.has(event.error.code)) continue;
        append(
          "frame-error",
          { ok: false, error: jsonCopy(event.error) },
          chunk,
        );
      }
    },

    getTrace(): WeaverTrace {
      return jsonCopy({
        format: WEAVER_TRACE_FORMAT,
        version: WEAVER_TRACE_VERSION,
        truncated,
        entries,
      }) as unknown as WeaverTrace;
    },

    clear() {
      entries.length = 0;
      nextSeq = 1;
      truncated = false;
    },
  };
}

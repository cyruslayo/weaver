import type { JsonValue } from "../protocol/index.js";
import type {
  WeaverActionRequest,
  WeaverInputRequest,
  WeaverRuntime,
} from "../runtime/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type {
  WeaverTrace,
  WeaverTraceEntry,
  WeaverTraceEntryKind,
  WeaverTraceOutcome,
} from "./types.js";

/** The part of an outcome that replay compares. */
export interface WeaverTraceReplayOutcome {
  ok: boolean;
  /** The error code. Present only when `ok` is false. */
  code?: string;
}

export interface WeaverTraceReplayStep {
  seq: number;
  kind: WeaverTraceEntryKind;
  /** The outcome stored in the trace. */
  recorded: WeaverTraceReplayOutcome;
  /**
   * The outcome from the replay runtime. It is null for `frame-error` entries,
   * which are reported but never re-applied.
   */
  replayed: WeaverTraceReplayOutcome | null;
  /** True when `ok` or the error `code` differs from the recording. */
  diverged: boolean;
}

export interface WeaverTraceReplayOptions {
  /**
   * A fresh runtime that the caller built with the catalogs and functions the
   * trace needs. Replay never builds a runtime or installs callbacks.
   *
   * Local function actions run the host implementation registered on this
   * runtime. Effectful functions such as `openUrl` must therefore be given mock
   * implementations here, or they will run for real.
   */
  runtime: WeaverRuntime;
  /** Replay only entries whose `seq` is at most this value. Must be a safe integer. */
  until?: number;
}

export interface WeaverTraceReplayResult {
  steps: WeaverTraceReplayStep[];
  /**
   * Surfaces that exist on the replay runtime after the replayed steps, keyed by
   * surfaceId. Surfaces that do not exist are omitted.
   */
  surfaces: Record<string, SurfaceSnapshot>;
}

/** Reported for an input or action entry whose recorded request is missing required fields. */
export const WEAVER_TRACE_REPLAY_INVALID_INPUT = "REPLAY_INVALID_INPUT";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordedOutcome(outcome: WeaverTraceOutcome): WeaverTraceReplayOutcome {
  if (outcome.ok) return { ok: true };
  const code = isObject(outcome.error) ? outcome.error.code : undefined;
  return typeof code === "string" ? { ok: false, code } : { ok: false };
}

function resultOutcome(
  result: { ok: true } | { ok: false; error: { code: string } },
): WeaverTraceReplayOutcome {
  return result.ok ? { ok: true } : { ok: false, code: result.error.code };
}

function inputRequestOf(input: JsonValue | undefined): WeaverInputRequest | undefined {
  if (!isObject(input)) return undefined;
  const { surfaceId, sourceComponentId, scopePath, property, value } = input;
  if (
    typeof surfaceId !== "string" ||
    typeof sourceComponentId !== "string" ||
    typeof scopePath !== "string" ||
    typeof property !== "string" ||
    value === undefined
  )
    return undefined;
  return {
    surfaceId,
    sourceComponentId,
    scopePath,
    property,
    value: value as JsonValue,
  };
}

function actionRequestOf(input: JsonValue | undefined): WeaverActionRequest | undefined {
  if (!isObject(input)) return undefined;
  const { surfaceId, sourceComponentId, scopePath, actionProperty } = input;
  if (
    typeof surfaceId !== "string" ||
    typeof sourceComponentId !== "string" ||
    typeof scopePath !== "string" ||
    typeof actionProperty !== "string"
  )
    return undefined;
  return { surfaceId, sourceComponentId, scopePath, actionProperty };
}

/**
 * Re-issues one entry on the replay runtime. Returns null when the entry is
 * not applied. Any surface the replay names is added to `surfaceIds`.
 */
function reissue(
  entry: WeaverTraceEntry,
  runtime: WeaverRuntime,
  surfaceIds: Set<string>,
): WeaverTraceReplayOutcome | null {
  switch (entry.kind) {
    case "frame-error":
      return null;
    case "message": {
      const result = runtime.process(entry.input);
      if (result.ok) surfaceIds.add(result.value.surfaceId);
      return resultOutcome(result);
    }
    case "input": {
      const request = inputRequestOf(entry.input);
      if (request === undefined) return { ok: false, code: WEAVER_TRACE_REPLAY_INVALID_INPUT };
      surfaceIds.add(request.surfaceId);
      return resultOutcome(runtime.writeInput(request));
    }
    case "action": {
      const request = actionRequestOf(entry.input);
      if (request === undefined) return { ok: false, code: WEAVER_TRACE_REPLAY_INVALID_INPUT };
      surfaceIds.add(request.surfaceId);
      return resultOutcome(runtime.dispatchAction(request));
    }
  }
}

/**
 * Replays a weaver-trace into a fresh runtime, one entry at a time, in seq order.
 *
 * - `message` entries are re-processed.
 * - `input` and `action` entries are re-issued through writeInput() and
 *   dispatchAction(). A malformed request is reported as diverged, not thrown.
 * - `frame-error` entries are reported with `replayed: null` and not applied.
 * - A step diverges when `ok` or the error `code` differs from the recording.
 *   A different success value does not count as a divergence.
 * - `until` replays only entries with `seq <= until`, which supports
 *   stepping to a point in the inspector.
 *
 * Replay never touches a transport. Core dispatchAction() is transport-neutral,
 * so the only callbacks that run are the host functions on `runtime`. See
 * `WeaverTraceReplayOptions.runtime`.
 *
 * A truncated trace holds only its newest entries. Replaying it cannot rebuild
 * the state those entries depend on, so the first replayed steps may diverge.
 * Validate untrusted input with parseWeaverTrace() before calling this.
 *
 * @throws {RangeError} when `until` is not a safe integer.
 */
export function replayWeaverTrace(
  trace: WeaverTrace,
  options: WeaverTraceReplayOptions,
): WeaverTraceReplayResult {
  const { runtime, until } = options;
  if (until !== undefined && !Number.isSafeInteger(until))
    throw new RangeError("until must be a safe integer");

  const steps: WeaverTraceReplayStep[] = [];
  const surfaceIds = new Set<string>();

  for (const entry of trace.entries) {
    if (until !== undefined && entry.seq > until) break;
    const recorded = recordedOutcome(entry.outcome);
    const replayed = reissue(entry, runtime, surfaceIds);
    steps.push({
      seq: entry.seq,
      kind: entry.kind,
      recorded,
      replayed,
      diverged:
        replayed !== null &&
        (recorded.ok !== replayed.ok || recorded.code !== replayed.code),
    });
  }

  const surfaces: Record<string, SurfaceSnapshot> = {};
  for (const surfaceId of surfaceIds) {
    const snapshot = runtime.getSurface(surfaceId);
    if (snapshot !== undefined) surfaces[surfaceId] = snapshot;
  }
  return { steps, surfaces };
}

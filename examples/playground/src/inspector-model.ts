import {
  parseWeaverTrace,
  replayWeaverTrace,
  type WeaverTrace,
  type WeaverTraceReplayResult,
} from "@cylayo/weaver-core";
import type { BasicWebRuntime, WebServerEventHandoff } from "@cylayo/weaver-web";
import { createInspectorWebRuntime } from "./runtime-factory.js";

export type TraceLoadResult =
  | { ok: true; trace: WeaverTrace }
  | { ok: false; message: string };

/**
 * Parses trace text from a file or from the bundled sample. Any failure becomes
 * a sentence a developer can act on. The text is data, so the caller must show
 * the message with textContent.
 */
export function loadTraceText(text: string): TraceLoadResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, message: "This file is not valid JSON, so it is not a weaver-trace." };
  }
  const parsed = parseWeaverTrace(value);
  if (parsed.ok) return { ok: true, trace: parsed.value };
  const error = parsed.error;
  switch (error.code) {
    case "WRONG_FORMAT":
      return {
        ok: false,
        message: `This JSON is not a weaver-trace file. Its format field is ${JSON.stringify(error.format) ?? "missing"}.`,
      };
    case "UNSUPPORTED_VERSION":
      return {
        ok: false,
        message: `Trace version ${JSON.stringify(error.version) ?? "missing"} is not supported. This inspector reads version 1.`,
      };
    case "MALFORMED_TRACE":
      return {
        ok: false,
        message: `The trace is malformed at ${error.path}: ${error.reason}.`,
      };
  }
}

export interface ReplayUpToResult {
  /** The runtime after replaying entries up to and including the step. Its live surface is mounted by the caller. */
  web: BasicWebRuntime;
  replay: WeaverTraceReplayResult;
}

/**
 * Replays the trace into a fresh runtime up to the entry at `index`. Every step
 * builds a new runtime, so the view at a step never depends on earlier stepping.
 * Server events go to `onServerEvent`, which the inspector only logs.
 * Returns undefined when the runtime cannot be configured.
 */
export function replayTraceUpTo(
  trace: WeaverTrace,
  index: number,
  onServerEvent: (event: WebServerEventHandoff) => void,
): ReplayUpToResult | undefined {
  const entry = trace.entries[index];
  if (entry === undefined) return undefined;
  const created = createInspectorWebRuntime({ onServerEvent });
  if (!created.ok) return undefined;
  const web = created.value;
  const replay = replayWeaverTrace(trace, { runtime: web.runtime, until: entry.seq });
  return { web, replay };
}

/** Surface IDs that exist after the replay, in the order the replay reports them. */
export function existingSurfaceIds(replay: WeaverTraceReplayResult): string[] {
  return Object.keys(replay.surfaces);
}

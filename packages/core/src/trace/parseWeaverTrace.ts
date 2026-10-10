import {
  WEAVER_TRACE_FORMAT,
  WEAVER_TRACE_VERSION,
  type WeaverTrace,
  type WeaverTraceEntryKind,
  type WeaverTraceParseResult,
} from "./types.js";

const ENTRY_KINDS: ReadonlySet<string> = new Set<WeaverTraceEntryKind>([
  "message",
  "frame-error",
  "input",
  "action",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Iterative, so deep or cyclic input cannot exhaust the stack or hang. */
function isJsonValue(root: unknown): boolean {
  const stack: { value: unknown; leave: boolean }[] = [{ value: root, leave: false }];
  const ancestors = new Set<object>();
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.leave) {
      ancestors.delete(frame.value as object);
      continue;
    }
    const value = frame.value;
    if (value === null || typeof value === "string" || typeof value === "boolean")
      continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) continue;
      return false;
    }
    if (typeof value !== "object" || ancestors.has(value)) return false;
    const isArray = Array.isArray(value);
    if (!isArray && !isPlainObject(value)) return false;
    ancestors.add(value);
    stack.push({ value, leave: true });
    const children: unknown[] = isArray
      ? Array.from(value as unknown[])
      : Object.keys(value).map((key) => (value as Record<string, unknown>)[key]);
    for (const child of children) stack.push({ value: child, leave: false });
  }
  return true;
}

class TraceShapeError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(reason);
  }
}

function fail(path: string, reason: string): never {
  throw new TraceShapeError(path, reason);
}

function requireKeys(
  value: Record<string, unknown>,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  for (const key of required)
    if (!Object.prototype.hasOwnProperty.call(value, key))
      fail(path, `missing key "${key}"`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) fail(path, `unknown key "${key}"`);
}

function requireJson(value: unknown, path: string): void {
  if (!isJsonValue(value)) fail(path, "value is not JSON-safe");
}

function requireIsoTimestamp(value: unknown, path: string): void {
  if (typeof value !== "string") fail(path, "timestamp must be a string");
  const time = Date.parse(value);
  if (Number.isNaN(time) || new Date(time).toISOString() !== value)
    fail(path, "timestamp must be an ISO 8601 UTC string");
}

function validateOutcome(value: unknown, kind: string, path: string): void {
  if (!isPlainObject(value)) fail(path, "outcome must be an object");
  if (value.ok !== true && value.ok !== false) fail(`${path}.ok`, "ok must be a boolean");
  if (value.ok === true) {
    if (kind === "frame-error") fail(path, "frame-error entries must record a failure");
    requireKeys(value, path, ["ok", "summary"]);
    requireJson(value.summary, `${path}.summary`);
    return;
  }
  requireKeys(value, path, ["ok", "error"]);
  const error = value.error;
  if (!isPlainObject(error) || typeof error.code !== "string")
    fail(`${path}.error`, "error must be an object with a string code");
  requireJson(error, `${path}.error`);
}

function validateTrace(value: Record<string, unknown>): void {
  requireKeys(value, "$", ["format", "version", "truncated", "entries"]);
  if (typeof value.truncated !== "boolean")
    fail("$.truncated", "truncated must be a boolean");
  if (!Array.isArray(value.entries)) fail("$.entries", "entries must be an array");

  let previousSeq = 0;
  (value.entries as unknown[]).forEach((entry, index) => {
    const path = `$.entries[${index}]`;
    if (!isPlainObject(entry)) fail(path, "entry must be an object");
    requireKeys(entry, path, ["seq", "at", "kind", "outcome"], ["input"]);

    const seq = entry.seq;
    if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1)
      fail(`${path}.seq`, "seq must be a positive safe integer");
    if (seq <= previousSeq) fail(`${path}.seq`, "seq must increase strictly");
    previousSeq = seq;

    requireIsoTimestamp(entry.at, `${path}.at`);
    if (typeof entry.kind !== "string" || !ENTRY_KINDS.has(entry.kind))
      fail(`${path}.kind`, "unknown entry kind");
    if ("input" in entry) requireJson(entry.input, `${path}.input`);
    validateOutcome(entry.outcome, entry.kind, `${path}.outcome`);
  });
}

/**
 * Validates a value as a weaver-trace v1 document. It rejects a wrong format
 * or an unknown version, unknown keys, wrong types, non-JSON values, and seq
 * numbers that do not increase. The result is a fresh copy, so the caller's
 * value is never aliased.
 */
export function parseWeaverTrace(value: unknown): WeaverTraceParseResult {
  if (!isPlainObject(value))
    return {
      ok: false,
      error: { code: "MALFORMED_TRACE", path: "$", reason: "trace must be an object" },
    };
  if (value.format !== WEAVER_TRACE_FORMAT)
    return { ok: false, error: { code: "WRONG_FORMAT", format: value.format } };
  if (value.version !== WEAVER_TRACE_VERSION)
    return { ok: false, error: { code: "UNSUPPORTED_VERSION", version: value.version } };
  try {
    validateTrace(value);
  } catch (error) {
    if (error instanceof TraceShapeError)
      return {
        ok: false,
        error: { code: "MALFORMED_TRACE", path: error.path, reason: error.reason },
      };
    throw error;
  }
  return { ok: true, value: JSON.parse(JSON.stringify(value)) as WeaverTrace };
}

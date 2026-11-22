import type { JsonObject, JsonValue } from "../protocol/index.js";

/** A FunctionCall embedded in a component, with a JSON pointer to it from the component. */
export interface EmbeddedFunctionCall {
  call: JsonObject;
  /** RFC 6901 pointer from the component object; the empty string is the component itself. */
  path: string;
}

/** The component envelope keys that carry no evaluated values. @metadata is opaque extension data. */
const UNEVALUATED_COMPONENT_KEYS: ReadonlySet<string> = new Set(["id", "component", "@metadata"]);

/** One step from a parent value to a child. Steps link back to the root, so no path is copied while walking. */
interface PathStep {
  readonly parent: PathStep | undefined;
  readonly segment: string;
}

interface PendingValue {
  readonly value: JsonValue;
  readonly step: PathStep | undefined;
}

function pointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function pointerOf(step: PathStep | undefined): string {
  const segments: string[] = [];
  for (let current = step; current !== undefined; current = current.parent) segments.push(current.segment);
  return segments
    .reverse()
    .map((segment) => `/${segment}`)
    .join("");
}

function isPlainObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Every FunctionCall in a component's evaluated values, in document order. A FunctionCall is an
 * object with a string @call, the same shape the evaluator treats as a call. Calls nested in the
 * arguments of another call are included, each at its own path.
 *
 * The walk uses an explicit stack, so a deeply nested value cannot exhaust the call stack.
 */
export function embeddedFunctionCalls(component: JsonObject): EmbeddedFunctionCall[] {
  const calls: EmbeddedFunctionCall[] = [];
  const pending: PendingValue[] = [];
  const roots = Object.entries(component).filter(([key]) => !UNEVALUATED_COMPONENT_KEYS.has(key));
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    const [key, value] = roots[index]!;
    pending.push({ value, step: { parent: undefined, segment: pointerSegment(key) } });
  }
  while (pending.length > 0) {
    const { value, step } = pending.pop()!;
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: value[index]!, step: { parent: step, segment: String(index) } });
      }
      continue;
    }
    if (!isPlainObject(value)) continue;
    if (typeof value["@call"] === "string") calls.push({ call: value, path: pointerOf(step) });
    const children = Object.entries(value);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const [key, child] = children[index]!;
      pending.push({ value: child, step: { parent: step, segment: pointerSegment(key) } });
    }
  }
  return calls;
}

import type { JsonValue } from "../protocol/index.js";

/** Clones protocol-validated JSON without retaining caller-owned references. */
export function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJson(entry)) as T;
  }

  const clone: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    clone[key] = cloneJson(entry);
  }
  return clone as T;
}

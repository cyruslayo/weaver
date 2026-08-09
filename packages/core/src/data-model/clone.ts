import type { JsonValue } from "../protocol/index.js";

export function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson) as T;

  const result: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) result[key] = cloneJson(entry);
  return result as T;
}

export function equalJson(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

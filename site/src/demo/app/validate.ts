/**
 * Small checks the app runs on what the page sent. Each one looks at the exact shape it expects
 * and nothing else, so an unexpected type or an extra key is refused.
 */
import type { JsonObject } from "@cylayo/weaver-core";

/** True when the context has exactly these keys, no more and no fewer. */
export function hasExactKeys(context: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(context);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(context, key));
}

/** True when the value is one of the allowed strings. */
export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

/** True when the value is a whole number from min to max, inclusive. */
export function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** True when the value is a list of exactly one allowed string, as a single-choice picker writes it. */
export function isSingleChoice<T extends string>(value: unknown, allowed: readonly T[]): value is [T] {
  return Array.isArray(value) && value.length === 1 && isOneOf(value[0], allowed);
}

/** True when the value is a list of strings. */
export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

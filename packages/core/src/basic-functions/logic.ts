import { coerceDynamicBoolean } from "../functions/index.js";

/**
 * and/or take DynamicBoolean items. The catalog layer reports an array of
 * DynamicBoolean as a dynamic-value array, so each item is coerced here with the
 * shared DynamicBoolean table (ValidationResult.valid, "true"/"false", and so on).
 */
function booleanValues(args: Readonly<Record<string, unknown>>): boolean[] {
  if (!Array.isArray(args.values)) throw new TypeError("values must be an array");
  return args.values.map((value) => coerceDynamicBoolean(value));
}

export function and(args: Readonly<Record<string, unknown>>): boolean {
  return booleanValues(args).every((value) => value);
}

export function or(args: Readonly<Record<string, unknown>>): boolean {
  return booleanValues(args).some((value) => value);
}

export function not(args: Readonly<Record<string, unknown>>): boolean {
  return !coerceDynamicBoolean(args.value);
}

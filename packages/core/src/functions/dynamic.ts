import type { JsonObject, JsonValue } from "../protocol/index.js";

/**
 * Shared A2UI v1.0 dynamic-value recognition. Every binding, function-call and
 * reserved-key decision in Core goes through this module so the wire rules are
 * stated once:
 *
 * - `{"@path": "<pointer>"}` is a DataBinding (exactly one key).
 * - `{"@call": "<name>", "args"?: {...}, "catalogId"?: string}` is a FunctionCall.
 * - A plain object with `path` or `call` keys is a literal, never a binding.
 * - Any other single-`@` key (`^@([^@]|$)`) inside a dynamic object is rejected.
 * - `@@key` inside a dynamic object is unescaped to `@key`.
 */

/** Reserved single-`@` key shape. Doubled `@@` keys are escapes, not reserved keys. */
const RESERVED_SINGLE_AT = /^@([^@]|$)/u;

export interface DataBinding {
  "@path": string;
}

export interface FunctionCallShape {
  "@call": string;
  args?: JsonObject;
  catalogId?: string;
}

export interface ReservedKeyError {
  code: "INVALID_RESERVED_KEY";
  key: string;
  path: string;
}

export type DynamicValueUnescapeResult =
  | { ok: true; value: JsonValue }
  | { ok: false; error: ReservedKeyError };

export type DynamicBooleanValue = boolean;

const FUNCTION_CALL_KEYS: ReadonlySet<string> = new Set(["@call", "args", "catalogId"]);

function isPlainObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** True for exactly `{"@path": string}`. */
export function isDataBinding(value: unknown): value is DataBinding {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "@path" && typeof value["@path"] === "string";
}

/** True for a structurally valid v1.0 FunctionCall. Catalog validation remains authoritative. */
export function isFunctionCall(value: unknown): value is FunctionCallShape {
  if (!isPlainObject(value)) return false;
  if (typeof value["@call"] !== "string") return false;
  for (const key of Object.keys(value)) {
    if (!FUNCTION_CALL_KEYS.has(key)) return false;
  }
  if (Object.hasOwn(value, "args") && !isPlainObject(value.args)) return false;
  if (Object.hasOwn(value, "catalogId") && typeof value.catalogId !== "string") return false;
  return true;
}

/** True when a key is a reserved single-`@` key that no dynamic position accepts. */
export function isReservedSingleAtKey(key: string): boolean {
  return RESERVED_SINGLE_AT.test(key);
}

/**
 * Applies the literal-object rule to a DynamicValue that is neither a binding
 * nor a call: `@@key` becomes `@key`, and any other single-`@` key is an error.
 * Nested objects and arrays inside the literal are treated the same way.
 */
export function unescapeLiteralDynamicValue(value: JsonValue, path = ""): DynamicValueUnescapeResult {
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const entry = unescapeLiteralDynamicValue(value[index]!, `${path}/${index}`);
      if (!entry.ok) return entry;
      items.push(entry.value);
    }
    return { ok: true, value: items };
  }
  if (!isPlainObject(value)) return { ok: true, value };

  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isReservedSingleAtKey(key)) {
      return { ok: false, error: { code: "INVALID_RESERVED_KEY", key, path } };
    }
    const outputKey = key.startsWith("@@") ? key.slice(1) : key;
    const unescaped = unescapeLiteralDynamicValue(entry, `${path}/${escapePointerToken(key)}`);
    if (!unescaped.ok) return unescaped;
    result[outputKey] = unescaped.value;
  }
  return { ok: true, value: result };
}

function escapePointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * Coerces any resolved value to the boolean a DynamicBoolean position receives.
 *
 * Follows the "DynamicBoolean → boolean" table in the A2UI v1.0 specification,
 * section "DynamicBoolean and CheckRule Coercion" (a2ui_protocol.md, Renderer-side
 * logic & validation).
 */
export function coerceDynamicBoolean(value: unknown): DynamicBooleanValue {
  if (typeof value === "boolean") return value;
  if (isPlainObject(value)) return typeof value.valid === "boolean" ? value.valid : false;
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    return lowered === "true";
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

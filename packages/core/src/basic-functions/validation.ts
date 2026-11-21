import { codePointLength } from "./regexDialect.js";

/** The ValidationResult shape the basic validators return. */
export interface BasicValidationResult {
  valid: boolean;
}

function validation(valid: boolean): BasicValidationResult {
  return { valid };
}

/** Present means not null, not undefined, not "", and not an empty array. */
export function required(args: Readonly<Record<string, unknown>>): BasicValidationResult {
  const value = args.value;
  return validation(value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0));
}

function boundOf(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

/** Checks the string length in code points. The catalog requires at least one of min or max. */
export function length(args: Readonly<Record<string, unknown>>): BasicValidationResult {
  const min = boundOf(args.min, "min");
  const max = boundOf(args.max, "max");
  if (min === undefined && max === undefined) throw new TypeError("length requires min or max");
  if (typeof args.value !== "string") return validation(false);
  const count = codePointLength(args.value);
  return validation((min === undefined || count >= min) && (max === undefined || count <= max));
}

/** Checks a number range. Strings count only when they parse as a complete number, with no coercion of other types. */
export function numeric(args: Readonly<Record<string, unknown>>): BasicValidationResult {
  const min = boundOf(args.min, "min");
  const max = boundOf(args.max, "max");
  if (min === undefined && max === undefined) throw new TypeError("numeric requires min or max");
  const raw = args.value;
  const value =
    typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : Number.NaN;
  if (!Number.isFinite(value)) return validation(false);
  return validation((min === undefined || value >= min) && (max === undefined || value <= max));
}

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** The guide's simple email shape. It is a pragmatic check, not full RFC 5322 validation. */
export function email(args: Readonly<Record<string, unknown>>): BasicValidationResult {
  return validation(typeof args.value === "string" && SIMPLE_EMAIL.test(args.value));
}

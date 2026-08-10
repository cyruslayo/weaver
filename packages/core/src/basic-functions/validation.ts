import { isDataPathBinding } from "../data-context/index.js";
import { isFunctionCall, type FunctionExecutionContext } from "../functions/index.js";

function resolveBroadValue(value: unknown, context: FunctionExecutionContext): unknown {
  if (isDataPathBinding(value)) {
    const result = context.dataContext.resolveBinding(value);
    if (!result.ok) throw new Error("Unable to resolve required binding");
    return result.value;
  }
  if (isFunctionCall(value)) {
    const result = context.evaluateFunctionCall(value);
    if (!result.ok) context.propagateFunctionFailure(result.error);
    return result.value;
  }
  return value;
}

export function required(args: Readonly<Record<string, unknown>>, context: FunctionExecutionContext): boolean {
  const value = resolveBroadValue(args.value, context);
  return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
}

export function length(args: Readonly<Record<string, unknown>>): boolean {
  if (typeof args.value !== "string") return false;
  const min = args.min;
  const max = args.max;
  if (min === undefined && max === undefined) return false;
  if (min !== undefined && (typeof min !== "number" || !Number.isFinite(min))) return false;
  if (max !== undefined && (typeof max !== "number" || !Number.isFinite(max))) return false;
  return (min === undefined || args.value.length >= min) && (max === undefined || args.value.length <= max);
}

export function numeric(args: Readonly<Record<string, unknown>>): boolean {
  const raw = args.value;
  const value = typeof raw === "number"
    ? raw
    : typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : Number.NaN;
  if (!Number.isFinite(value)) return false;
  const min = args.min;
  const max = args.max;
  if (min !== undefined && (typeof min !== "number" || !Number.isFinite(min) || value < min)) return false;
  if (max !== undefined && (typeof max !== "number" || !Number.isFinite(max) || value > max)) return false;
  return true;
}

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(args: Readonly<Record<string, unknown>>): boolean {
  return typeof args.value === "string" && SIMPLE_EMAIL.test(args.value);
}

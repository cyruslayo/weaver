import type { CatalogFunctionReturnType } from "../catalog/index.js";
import type { DataContext } from "../data-context/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";

export type FunctionReturnType = CatalogFunctionReturnType;

export interface FunctionCall {
  call: string;
  args: JsonObject;
  returnType?: FunctionReturnType;
}

/** Strict structural guard; catalog validation remains authoritative. */
export function isFunctionCall(value: unknown): value is FunctionCall {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.call !== "string" || record.args === null || typeof record.args !== "object" || Array.isArray(record.args)) {
    return false;
  }
  const argsPrototype = Object.getPrototypeOf(record.args);
  if (argsPrototype !== Object.prototype && argsPrototype !== null) return false;
  return !("returnType" in record) || (
    typeof record.returnType === "string" &&
    ["string", "number", "boolean", "array", "object", "any", "void"].includes(record.returnType)
  );
}

export type FunctionImplementation = (
  args: Readonly<Record<string, unknown>>,
  context: FunctionExecutionContext,
) => unknown;

export interface FunctionExecutionContext {
  catalogId: string;
  dataContext: DataContext;
  evaluateFunctionCall(call: FunctionCall): FunctionEvaluationResult;
  /** Re-throws a recursive typed failure through the current evaluator boundary. */
  propagateFunctionFailure(error: import("./errors.js").FunctionEvaluationError): never;
}

export interface FunctionRegistration {
  catalogId: string;
  name: string;
  implementation: FunctionImplementation;
}

export interface FunctionImplementationMetadata {
  catalogId: string;
  name: string;
  returnType: FunctionReturnType;
}

export type FunctionRegistrationResult =
  | { ok: true; value: FunctionImplementationMetadata }
  | { ok: false; error: import("./errors.js").FunctionRegistryError };

export type FunctionEvaluationValue = JsonValue | undefined;

export type FunctionEvaluationResult<T extends FunctionEvaluationValue = FunctionEvaluationValue> =
  | { ok: true; value: T }
  | { ok: false; error: import("./errors.js").FunctionEvaluationError };

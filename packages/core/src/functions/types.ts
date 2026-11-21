import type { CatalogFunctionReturnType } from "../catalog/index.js";
import type { DataContext } from "../data-context/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { isFunctionCall, type FunctionCallShape } from "./dynamic.js";

export type FunctionReturnType = CatalogFunctionReturnType;
export type FunctionEffect = "pure" | "action";

/** A v1.0 FunctionCall. `args` is optional; `catalogId` must match the surface catalog until multi-catalog support lands. */
export type FunctionCall = FunctionCallShape;

export { isFunctionCall };

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
  effect: FunctionEffect;
  implementation: FunctionImplementation;
}

export interface FunctionImplementationMetadata {
  catalogId: string;
  name: string;
  returnType: FunctionReturnType;
  effect: FunctionEffect;
}

export type FunctionRegistrationResult =
  | { ok: true; value: FunctionImplementationMetadata }
  | { ok: false; error: import("./errors.js").FunctionRegistryError };

export type FunctionEvaluationValue = JsonValue | undefined;

export type FunctionEvaluationResult<T extends FunctionEvaluationValue = FunctionEvaluationValue> =
  | { ok: true; value: T }
  | { ok: false; error: import("./errors.js").FunctionEvaluationError };

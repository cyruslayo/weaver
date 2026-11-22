import type { CatalogFunctionReturnType } from "../catalog/index.js";
import type { DataContext } from "../data-context/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { isFunctionCall, type FunctionCallShape } from "./dynamic.js";

export type FunctionReturnType = CatalogFunctionReturnType;
export type FunctionEffect = "pure" | "action";

/** A v1.0 FunctionCall. `args` is optional. `catalogId` is optional: without it the call resolves to the surface default catalog. */
export type FunctionCall = FunctionCallShape;

export { isFunctionCall };

export type FunctionImplementation = (
  args: Readonly<Record<string, unknown>>,
  context: FunctionExecutionContext,
) => unknown;

export interface FunctionExecutionContext {
  catalogId: string;
  dataContext: DataContext;
  /**
   * Evaluates a nested call. It resolves to its own catalogId, else to the surface default catalog, never to the
   * catalog of the calling function. formatString sets catalogId on its ${...} calls to scope them to its own catalog.
   */
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

/**
 * A successful evaluation has a value. `awaiting` is set when the value depends on
 * a routed agent call that has not settled (see agent-functions). Its value is
 * then undefined, which reads as pending and never as a failure. The call is not
 * executed. The id names the pending call that the evaluation waits on.
 */
export type FunctionEvaluationResult<T extends FunctionEvaluationValue = FunctionEvaluationValue> =
  | { ok: true; value: T; awaiting?: string }
  | { ok: false; error: import("./errors.js").FunctionEvaluationError };

import type { CatalogRegistryError } from "../catalog/index.js";
import type { DataContextError } from "../data-context/index.js";

export type FunctionRegistryError =
  | CatalogRegistryError
  | {
      code: "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED" | "FUNCTION_IMPLEMENTATION_NOT_FOUND";
      message: string;
      catalogId: string;
      functionName: string;
    };

export type FunctionEvaluationError =
  | CatalogRegistryError
  | {
      code:
        | "FUNCTION_IMPLEMENTATION_NOT_FOUND"
        | "FUNCTION_EFFECT_NOT_ALLOWED"
        | "FUNCTION_ARGUMENT_RESOLUTION_FAILED"
        | "FUNCTION_EXECUTION_FAILED"
        | "FUNCTION_RETURN_TYPE_MISMATCH"
        | "FUNCTION_MAX_DEPTH_EXCEEDED";
      message: string;
      catalogId: string;
      functionName: string;
      cause?: DataContextError;
      expected?: string;
      actual?: string;
    };

export type FunctionRegistryErrorCode = FunctionRegistryError["code"];
export type FunctionEvaluationErrorCode = FunctionEvaluationError["code"];

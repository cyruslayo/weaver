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
        | "FUNCTION_MAX_DEPTH_EXCEEDED"
        | "FUNCTION_CALLER_NOT_ALLOWED";
      message: string;
      catalogId: string;
      functionName: string;
      cause?: DataContextError;
      expected?: string;
      actual?: string;
    }
  | {
      /**
       * Activation-gated functions outside a user gesture, regex dialect or safety violations, and
       * agent routing refusals and failures. functionCallId is set when a routed agent call failed.
       */
      code: "EXPRESSION_ERROR";
      message: string;
      catalogId: string;
      functionName: string;
      functionCallId?: string;
    }
  | {
      /** Runtime failures such as @index outside a collection template scope. */
      code: "EXECUTION_ERROR";
      message: string;
      catalogId: string;
      functionName: string;
    }
  | {
      /** A FunctionCall.catalogId that differs from the surface catalog (multi-catalog is not yet supported). */
      code: "UNSUPPORTED_FEATURE";
      message: string;
      catalogId: string;
      functionName: string;
    }
  | {
      /** A reserved single-@ key inside a dynamic object (see functions/dynamic.ts). */
      code: "INVALID_RESERVED_KEY";
      message: string;
      catalogId: string;
      functionName: string;
      key: string;
      path: string;
    };

export type FunctionRegistryErrorCode = FunctionRegistryError["code"];
export type FunctionEvaluationErrorCode = FunctionEvaluationError["code"];

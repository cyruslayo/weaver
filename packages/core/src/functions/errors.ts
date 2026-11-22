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
      /** Argument failures. @index belongs to no catalog, so catalogId is absent for it. */
      code: "FUNCTION_ARGUMENT_RESOLUTION_FAILED";
      message: string;
      catalogId?: string;
      functionName: string;
      cause?: DataContextError;
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
      /**
       * Runtime failures such as @index outside a collection template scope. @index belongs to no
       * catalog, so catalogId is absent for it.
       */
      code: "EXECUTION_ERROR";
      message: string;
      catalogId?: string;
      functionName: string;
    }
  | {
      /**
       * A FunctionCall that names no catalogId, inside a surface with no default catalogId. Nothing
       * is run or routed. Ingress rejects such calls first, so this is reached only by a direct
       * evaluation that has no catalog to resolve against.
       */
      code: "CATALOG_RESOLUTION_FAILED";
      message: string;
      functionName: string;
    }
  | {
      /** A reserved single-@ key inside a dynamic object (see functions/dynamic.ts). */
      code: "INVALID_RESERVED_KEY";
      message: string;
      catalogId?: string;
      functionName: string;
      key: string;
      path: string;
    };

export type FunctionRegistryErrorCode = FunctionRegistryError["code"];
export type FunctionEvaluationErrorCode = FunctionEvaluationError["code"];

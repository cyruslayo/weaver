import type { FunctionEvaluationError } from "../functions/index.js";

/**
 * The renderer error codes a callRendererFunction can produce. Admission
 * failures are INVALID_FUNCTION_CALL. Argument evaluation and implementation
 * failures are EXECUTION_ERROR.
 */
export type RendererFunctionErrorCode = "INVALID_FUNCTION_CALL" | "EXECUTION_ERROR";

export interface RendererFunctionErrorOutcome {
  code: RendererFunctionErrorCode;
  message: string;
}

/** The generic message for a trusted implementation that threw or returned an invalid value. Exception text never reaches the agent. */
const EXECUTION_FAILED_MESSAGE = "An error occurred during function execution.";

function invalidCall(message: string): RendererFunctionErrorOutcome {
  return { code: "INVALID_FUNCTION_CALL", message };
}

function executionFailed(message: string): RendererFunctionErrorOutcome {
  return { code: "EXECUTION_ERROR", message };
}

/**
 * Maps a FunctionEvaluator failure to the renderer error an agent receives. The
 * switch has no default: adding a FunctionEvaluationError code fails the
 * typecheck until it is classified here.
 *
 * Messages that Core authored, and that name only catalog data supplied by the
 * agent, are passed through. Exception text from a host implementation is
 * never passed through.
 */
export function mapRendererFunctionError(error: FunctionEvaluationError): RendererFunctionErrorOutcome {
  switch (error.code) {
    case "CATALOG_NOT_FOUND":
      return invalidCall(`Catalog not found: ${error.catalogId}`);
    case "CATALOG_RESOLUTION_FAILED":
      return invalidCall(error.message);
    case "FUNCTION_NOT_ALLOWED":
      return invalidCall(`Function not found: ${error.functionName ?? ""}`);
    case "FUNCTION_VALIDATION_FAILED": {
      const detail = error.issues?.[0]?.message ?? "arguments do not satisfy the catalog schema";
      return invalidCall(`Invalid arguments for ${error.functionName ?? "function"}: ${detail}`);
    }
    case "FUNCTION_CALLER_NOT_ALLOWED":
    case "FUNCTION_EFFECT_NOT_ALLOWED":
    case "FUNCTION_IMPLEMENTATION_NOT_FOUND":
      return invalidCall(error.message);
    case "EXECUTION_ERROR":
      return executionFailed(error.message);
    case "FUNCTION_EXECUTION_FAILED":
    case "FUNCTION_ARGUMENT_RESOLUTION_FAILED":
    case "FUNCTION_RETURN_TYPE_MISMATCH":
    case "FUNCTION_MAX_DEPTH_EXCEEDED":
    case "EXPRESSION_ERROR":
    case "INVALID_RESERVED_KEY":
    case "INVALID_CATALOG_SCHEMA":
    case "CATALOG_ALREADY_REGISTERED":
    case "COMPONENT_NOT_ALLOWED":
    case "COMPONENT_STRUCTURE_NOT_FOUND":
    case "COMPONENT_VALIDATION_FAILED":
      return executionFailed(EXECUTION_FAILED_MESSAGE);
    default: {
      const unclassified: never = error;
      return unclassified;
    }
  }
}

import type { DataContextError } from "../data-context/index.js";

export type CheckEvaluatorErrorCode = "CHECK_DATA_CONTEXT_RECONSTRUCTION_FAILED";

export interface CheckEvaluatorError {
  code: CheckEvaluatorErrorCode;
  message: string;
  sourceComponentId: string;
  scopePath: string;
  cause: DataContextError;
}

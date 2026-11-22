import type { DataContextError } from "../data-context/index.js";

export type CheckEvaluatorErrorCode = "CHECK_DATA_CONTEXT_RECONSTRUCTION_FAILED" | "CATALOG_RESOLUTION_FAILED";

export type CheckEvaluatorError =
  | {
      code: "CHECK_DATA_CONTEXT_RECONSTRUCTION_FAILED";
      message: string;
      sourceComponentId: string;
      scopePath: string;
      cause: DataContextError;
    }
  | {
      /** A component that names no @catalogId inside a surface with no default catalogId. */
      code: "CATALOG_RESOLUTION_FAILED";
      message: string;
      sourceComponentId: string;
      scopePath: string;
    };

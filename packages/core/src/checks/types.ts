import type { ComponentInstanceSnapshot } from "../component-instances/index.js";
import type { DataContextError } from "../data-context/index.js";
import type { FunctionEvaluationError } from "../functions/index.js";

/**
 * "passed" and "advisory" both leave a component valid. "advisory" is a
 * non-blocking warning or info result: it is reported and blocks nothing.
 */
export type CheckStatus = "passed" | "failed" | "advisory" | "pending" | "error";
export type ComponentCheckStatus = "valid" | "invalid" | "pending" | "error";
export type CheckSeverity = "error" | "warning" | "info";

export type CheckEvaluationIssue =
  | {
      code: "CHECK_CONDITION_TYPE_MISMATCH";
      expected: "ValidationResult";
      actual: string;
    }
  | {
      code: "CHECK_BINDING_RESOLUTION_FAILED";
      error: DataContextError;
    }
  | {
      code: "CHECK_FUNCTION_EVALUATION_FAILED";
      error: FunctionEvaluationError;
    };

export interface EvaluatedCheck {
  index: number;
  status: CheckStatus;
  /** ValidationResult.message when present, otherwise CheckRule.message. */
  message?: string;
  /** ValidationResult.code, when the condition supplied one. */
  code?: string;
  /** ValidationResult.severity; defaults to "error". */
  severity: CheckSeverity;
  issues: CheckEvaluationIssue[];
}

export interface ComponentCheckSnapshot {
  sourceComponentId: string;
  scopePath: string;
  collectionIndex?: number;
  checkable: boolean;
  status: ComponentCheckStatus;
  checks: EvaluatedCheck[];
}

export interface ComponentCheckTreeSnapshot {
  ready: boolean;
  components: ComponentCheckSnapshot[];
}

export type CheckEvaluationResult<T = ComponentCheckSnapshot> =
  | { ok: true; value: T }
  | { ok: false; error: import("./errors.js").CheckEvaluatorError };

export type CheckTreeEvaluationResult = CheckEvaluationResult<ComponentCheckTreeSnapshot>;
export type ComponentInstanceTreeInput = ComponentInstanceSnapshot;

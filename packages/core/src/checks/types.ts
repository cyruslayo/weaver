import type { ComponentInstanceSnapshot } from "../component-instances/index.js";
import type { DataContextError } from "../data-context/index.js";
import type { FunctionEvaluationError } from "../functions/index.js";

export type CheckStatus = "passed" | "failed" | "pending" | "error";
export type ComponentCheckStatus = "valid" | "invalid" | "pending" | "error";

export type CheckEvaluationIssue =
  | {
      code: "CHECK_CONDITION_TYPE_MISMATCH";
      expected: "boolean";
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
  message: string;
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

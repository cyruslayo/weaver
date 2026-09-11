import type { ComponentTreeError } from "../component-tree/index.js";
import type { ResolutionBudgetExceededError } from "../runtime/safety.js";

export type ComponentInstanceErrorCode =
    | "COMPONENT_TREE_RESOLUTION_FAILED"
    | "RESOLUTION_BUDGET_EXCEEDED";

export type ComponentInstanceError =
    | {
          code: "COMPONENT_TREE_RESOLUTION_FAILED";
          message: string;
          cause: ComponentTreeError;
      }
    | ResolutionBudgetExceededError;

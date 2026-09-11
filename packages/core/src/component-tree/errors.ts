import type { CatalogRegistryError } from "../catalog/index.js";
import type { ResolutionBudgetExceededError } from "../runtime/safety.js";

export type ComponentTreeErrorCode =
    | "CATALOG_NOT_FOUND"
    | "COMPONENT_STRUCTURE_NOT_FOUND"
    | "RESOLUTION_BUDGET_EXCEEDED";

export type ComponentTreeError =
    | {
          code: "CATALOG_NOT_FOUND" | "COMPONENT_STRUCTURE_NOT_FOUND";
          message: string;
          catalogId: string;
          component?: string;
          cause: CatalogRegistryError;
      }
    | ResolutionBudgetExceededError;

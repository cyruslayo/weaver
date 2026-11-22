import type { CatalogRegistryError } from "../catalog/index.js";
import type { ResolutionBudgetExceededError } from "../runtime/safety.js";

export type ComponentTreeErrorCode =
    | "CATALOG_NOT_FOUND"
    | "COMPONENT_STRUCTURE_NOT_FOUND"
    | "CATALOG_RESOLUTION_FAILED"
    | "RESOLUTION_BUDGET_EXCEEDED";

export type ComponentTreeError =
    | {
          code: "CATALOG_NOT_FOUND" | "COMPONENT_STRUCTURE_NOT_FOUND";
          message: string;
          catalogId: string;
          component?: string;
          cause: CatalogRegistryError;
      }
    | {
          /** A component that names no @catalogId inside a surface with no default catalogId. */
          code: "CATALOG_RESOLUTION_FAILED";
          message: string;
          componentId: string;
      }
    | ResolutionBudgetExceededError;

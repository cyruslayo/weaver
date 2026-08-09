import type { ComponentTreeError } from "../component-tree/index.js";

export type ComponentInstanceErrorCode = "COMPONENT_TREE_RESOLUTION_FAILED";

export interface ComponentInstanceError {
  code: ComponentInstanceErrorCode;
  message: string;
  cause: ComponentTreeError;
}

import type { CatalogRegistryError } from "../catalog/index.js";
import type { CheckEvaluatorError, ComponentCheckSnapshot } from "../checks/index.js";
import type { DataContextError } from "../data-context/index.js";
import type { FunctionEvaluationError } from "../functions/index.js";
import type { ActionContextResolutionError } from "./types.js";

export type ActionDispatchError =
  | { code: "ACTION_PROPERTY_NOT_ALLOWED"; message: string; actionProperty: string; cause?: CatalogRegistryError }
  | { code: "ACTION_NOT_FOUND"; message: string; actionProperty: string }
  | { code: "ACTION_INVALID"; message: string; actionProperty: string }
  | { code: "ACTION_DATA_CONTEXT_FAILED"; message: string; cause: DataContextError }
  | { code: "ACTION_CHECK_EVALUATION_FAILED"; message: string; cause: CheckEvaluatorError }
  | { code: "ACTION_BLOCKED_BY_CHECKS"; message: string; checks: ComponentCheckSnapshot }
  | { code: "LOCAL_FUNCTION_FAILED"; message: string; cause: FunctionEvaluationError }
  | ActionContextResolutionError
  | { code: "CLIENT_DATA_MODEL_NOT_OBJECT"; message: string };

export type ActionDispatchErrorCode = ActionDispatchError["code"];

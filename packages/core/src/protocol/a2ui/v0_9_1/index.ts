export type {
  A2UIComponent,
  A2UIServerMessage,
  A2UIV091WireVersion,
  CreateSurfaceMessage,
  DeleteSurfaceMessage,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  UpdateComponentsMessage,
  UpdateDataModelMessage,
} from "./types.js";
export type {
  A2UIClientActionMessage,
  A2UIClientCapabilitiesV0_9_1,
  A2UIClientDataModel,
} from "./client-types.js";
export type { ValidationIssue, ValidationResult } from "./errors.js";
export { validateA2UIServerMessage } from "./validation.js";

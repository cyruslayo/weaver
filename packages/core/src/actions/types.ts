import type { ComponentCheckSnapshot } from "../checks/index.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import type { FunctionEvaluationError } from "../functions/index.js";
import type { A2UIClientActionMessage, A2UIClientDataModel, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type { ActionDispatchError } from "./errors.js";

export interface ActionTransportMetadata {
  a2uiClientDataModel: A2UIClientDataModel;
}

export type ActionDispatchResult =
  | { ok: true; value: { kind: "localFunction"; value: JsonValue | undefined } }
  | { ok: true; value: { kind: "serverEvent"; message: A2UIClientActionMessage; metadata?: ActionTransportMetadata } }
  | { ok: false; error: ActionDispatchError };

export interface ActionDispatchInput {
  surface: SurfaceSnapshot;
  instance: ResolvedComponentInstance;
  actionProperty: string;
}

export interface ActionDispatcherOptions {
  now?: () => Date;
}

export type ActionContextResolutionError =
  | { code: "ACTION_CONTEXT_VOID_FUNCTION"; message: string; key: string; functionName: string }
  | { code: "ACTION_CONTEXT_VALUE_UNAVAILABLE"; message: string; key: string }
  | { code: "ACTION_CONTEXT_RESOLUTION_FAILED"; message: string; key: string; cause?: FunctionEvaluationError };

export type ActionContextResolutionResult =
  | { ok: true; value: import("../protocol/index.js").JsonObject }
  | { ok: false; error: ActionContextResolutionError };

export interface BlockedActionDetails {
  checks: ComponentCheckSnapshot;
}

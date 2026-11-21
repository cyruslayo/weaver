import type { ComponentCheckSnapshot } from "../checks/index.js";
import type { ActionCallMemo } from "../agent-functions/types.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import type { FunctionEvaluationError } from "../functions/index.js";
import type {
  A2UIRendererActionMessage,
  A2UIRendererCallAgentFunctionMessage,
  A2UIRendererDataModel,
  JsonValue,
} from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type { ActionDispatchError } from "./errors.js";

export interface ActionTransportMetadata {
  a2uiRendererDataModel: A2UIRendererDataModel;
}

export type ActionDispatchResult =
  | { ok: true; value: { kind: "localFunction"; value: JsonValue | undefined } }
  | { ok: true; value: { kind: "serverEvent"; message: A2UIRendererActionMessage; metadata?: ActionTransportMetadata } }
  /**
   * The action waits on agent calls. Each message is a callAgentFunction the host
   * must send, once, on the surface's route. The action runs again when they settle.
   * An empty list means the calls were already sent and are still pending.
   */
  | { ok: true; value: { kind: "agentFunctionCalls"; messages: A2UIRendererCallAgentFunctionMessage[] } }
  | { ok: false; error: ActionDispatchError };

export interface ActionDispatchInput {
  surface: SurfaceSnapshot;
  instance: ResolvedComponentInstance;
  actionProperty: string;
  /** True only for an explicit user gesture; activation-gated functions require it. Defaults to false. */
  userActivation?: boolean;
  /** Set when the dispatch re-runs after an agent call settled. Shares the memo of the first run. */
  memo?: ActionCallMemo;
  /** Re-runs this dispatch once an agent call it waits on settles. Present only when agent routing is enabled. */
  continuation?: () => unknown;
}

export interface ActionDispatcherOptions {
  now?: () => Date;
}

export type ActionContextResolutionError =
  | { code: "ACTION_CONTEXT_VOID_FUNCTION"; message: string; key: string; functionName: string }
  | { code: "ACTION_CONTEXT_VALUE_UNAVAILABLE"; message: string; key: string }
  | { code: "ACTION_CONTEXT_RESOLUTION_FAILED"; message: string; key: string; cause?: FunctionEvaluationError }
  | { code: "INVALID_RESERVED_KEY"; message: string; key: string; reservedKey: string; path: string };

export type ActionContextResolutionResult =
  /** `awaiting` is set when an entry waits on an agent call; the value is then incomplete and must not be used. */
  | { ok: true; value: import("../protocol/index.js").JsonObject; awaiting?: string }
  | { ok: false; error: ActionContextResolutionError };

export interface BlockedActionDetails {
  checks: ComponentCheckSnapshot;
}

import type { A2UIRendererCallAgentFunctionMessage, JsonObject, JsonValue } from "../protocol/index.js";

/**
 * Host configuration for renderer-to-agent calls (callAgentFunction). The
 * object's presence enables routing. Without it, a call that would route fails
 * locally with EXPRESSION_ERROR.
 */
export interface AgentFunctionsConfig {
  /** Upper bound on pending calls. Defaults to 256. */
  maxPending?: number;
  /**
   * Produces the functionCallId of each call. Defaults to a deterministic
   * counter (`agent-call-1`, `agent-call-2`, ...). Ids must be unique among
   * pending calls.
   */
  createFunctionCallId?: () => string;
  /**
   * Called after a reactive call is queued for draining. Exceptions are
   * ignored, so the hook can never change a result or the runtime's state. It
   * may call takeAgentFunctionCalls().
   */
  onCallQueued?: () => void;
}

/** Why a host cancels a pending call. Core has no clock, so timeouts come from the host. */
export type AgentFunctionCancelReason = "TIMEOUT" | "TRANSPORT_FAILED";

/** A reactive call (binding or check) may share and reuse its settled answer. An action call never does. */
export type AgentFunctionCallKind = "reactive" | "action";

/** A routed call failed. The error is reported as EXPRESSION_ERROR with its functionCallId. */
export interface AgentFunctionCallFailure {
  code: "EXPRESSION_ERROR";
  message: string;
  functionCallId: string;
}

/** The state of one call memoized inside one action dispatch. */
export type ActionMemoState =
  | { state: "pending"; functionCallId: string }
  | { state: "settled"; value: JsonValue }
  | { state: "failed"; failure: AgentFunctionCallFailure };

/**
 * Per-dispatch memo of an action's agent calls. An action dispatch that waits
 * on a call is run again when the call settles. The memo keeps the settled
 * answers, so the replay sends nothing twice and no call is shared with another
 * action. `outbox` holds the callAgentFunction messages the dispatch created.
 */
export interface ActionCallMemo {
  readonly states: Map<string, ActionMemoState>;
  readonly outbox: A2UIRendererCallAgentFunctionMessage[];
}

/**
 * What a routed evaluation needs to know about its surface. A reactive scope is
 * used for bindings and checks. An action scope also carries the memo and the
 * function that re-runs the action when a call settles.
 */
export type AgentFunctionScope =
  | { surfaceId: string; kind: "reactive" }
  | {
      surfaceId: string;
      kind: "action";
      memo: ActionCallMemo;
      continuation: () => unknown;
    };

/** A call the evaluator asks the router to run. `args` are resolved and validated. */
export interface AgentFunctionRouteRequest {
  scope: AgentFunctionScope;
  catalogId: string;
  functionName: string;
  args: JsonObject;
}

/**
 * The router's answer. `pending` means the call awaits a response; a reactive
 * pending answer is delivered by the queue, an action pending answer by the
 * action's outbox. `refused` is a local failure that was never sent.
 */
export type AgentFunctionRouteOutcome =
  | { kind: "value"; value: JsonValue }
  | { kind: "pending"; functionCallId: string }
  | { kind: "failed"; failure: AgentFunctionCallFailure }
  | { kind: "refused"; message: string };

/** The evaluator's view of a router: Core's pending-call broker implements this. */
export interface AgentFunctionRouter {
  route(request: AgentFunctionRouteRequest): AgentFunctionRouteOutcome;
}

export type { JsonValue };

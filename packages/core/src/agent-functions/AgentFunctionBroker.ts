import { cloneJson } from "../data-model/clone.js";
import type { A2UIRendererCallAgentFunctionMessage, JsonObject, JsonValue } from "../protocol/index.js";
import type {
  ActionCallMemo,
  ActionMemoState,
  AgentFunctionCallKind,
  AgentFunctionCancelReason,
  AgentFunctionRouteOutcome,
  AgentFunctionRouteRequest,
  AgentFunctionRouter,
  AgentFunctionsConfig,
} from "./types.js";

/** The default bound on pending calls. */
export const DEFAULT_MAX_PENDING = 256;
/** Settled reactive answers kept per broker, as a multiple of maxPending. */
const SETTLED_CACHE_FACTOR = 4;

/** An answer that is final: a value, or a failure reported to the dependents. */
type SettledOutcome = Extract<AgentFunctionRouteOutcome, { kind: "value" | "failed" }>;

export type AgentFunctionsConfigurationError =
  | { code: "INVALID_AGENT_FUNCTIONS_CONFIGURATION"; reason: "MUST_BE_OBJECT" }
  | { code: "INVALID_AGENT_FUNCTIONS_CONFIGURATION"; reason: "MAX_PENDING_MUST_BE_POSITIVE_SAFE_INTEGER" }
  | {
      code: "INVALID_AGENT_FUNCTIONS_CONFIGURATION";
      reason: "MUST_BE_FUNCTION";
      option: "createFunctionCallId" | "onCallQueued";
    };

/** The validated, defaulted configuration. `createFunctionCallId` and `onCallQueued` are present only when the host set them. */
export interface NormalizedAgentFunctionsConfig {
  maxPending: number;
  createFunctionCallId?: () => string;
  onCallQueued?: () => void;
}

export type AgentFunctionsConfigurationResult =
  | { ok: true; value: NormalizedAgentFunctionsConfig }
  | { ok: false; error: AgentFunctionsConfigurationError };

/** Validates host configuration. An absent config is valid and leaves routing off. */
export function normalizeAgentFunctionsConfig(config: AgentFunctionsConfig | undefined): AgentFunctionsConfigurationResult {
  if (config === undefined) {
    return { ok: true, value: { maxPending: DEFAULT_MAX_PENDING } };
  }
  if (typeof config !== "object" || config === null) {
    return { ok: false, error: { code: "INVALID_AGENT_FUNCTIONS_CONFIGURATION", reason: "MUST_BE_OBJECT" } };
  }
  const maxPending = config.maxPending ?? DEFAULT_MAX_PENDING;
  if (!Number.isSafeInteger(maxPending) || maxPending <= 0) {
    return {
      ok: false,
      error: { code: "INVALID_AGENT_FUNCTIONS_CONFIGURATION", reason: "MAX_PENDING_MUST_BE_POSITIVE_SAFE_INTEGER" },
    };
  }
  if (config.createFunctionCallId !== undefined && typeof config.createFunctionCallId !== "function") {
    return {
      ok: false,
      error: { code: "INVALID_AGENT_FUNCTIONS_CONFIGURATION", reason: "MUST_BE_FUNCTION", option: "createFunctionCallId" },
    };
  }
  if (config.onCallQueued !== undefined && typeof config.onCallQueued !== "function") {
    return {
      ok: false,
      error: { code: "INVALID_AGENT_FUNCTIONS_CONFIGURATION", reason: "MUST_BE_FUNCTION", option: "onCallQueued" },
    };
  }
  return {
    ok: true,
    value: {
      maxPending,
      ...(config.createFunctionCallId === undefined ? {} : { createFunctionCallId: config.createFunctionCallId }),
      ...(config.onCallQueued === undefined ? {} : { onCallQueued: config.onCallQueued }),
    },
  };
}

/** Canonical JSON: object keys sorted, so equal arguments share one key whatever their order. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`).join(",")}}`;
}

function callKey(surfaceId: string, catalogId: string, functionName: string, args: JsonObject): string {
  return JSON.stringify([surfaceId, catalogId, functionName, canonicalJson(args)]);
}

interface PendingCall {
  surfaceId: string;
  kind: AgentFunctionCallKind;
  key: string;
  message: A2UIRendererCallAgentFunctionMessage;
  /** Action calls only: the memo of the dispatch that created the call, and the function that re-runs it. */
  memo?: ActionCallMemo;
  continuation?: () => unknown;
}

interface SettledAnswer {
  surfaceId: string;
  outcome: SettledOutcome;
}

/** The result of settling or cancelling a call. A call that is unknown or already final is `ignored`. */
export type AgentFunctionSettlement =
  | { status: "ignored" }
  | { status: "settled" | "cancelled"; surfaceId: string; continuation?: () => unknown };

/**
 * Owns the pending renderer-to-agent calls of one runtime: the table keyed by
 * functionCallId, the queue of reactive calls waiting to be drained, the
 * settled answers of reactive calls, and the memo of each action dispatch.
 * Core sends nothing. The host drains the queue and delivers each message, and
 * it reports every settlement back.
 */
export class AgentFunctionBroker implements AgentFunctionRouter {
  readonly #maxPending: number;
  readonly #settledLimit: number;
  readonly #createId: (() => string) | undefined;
  readonly #onCallQueued: (() => void) | undefined;
  readonly #pending = new Map<string, PendingCall>();
  /** Pending reactive calls by key, so identical calls share one request. */
  readonly #pendingReactive = new Map<string, string>();
  /**
   * Final reactive answers by key, per surface. Failures are kept too.
   *
   * Deviation from the pinned conformance case "agent error is expression error", which
   * sends the call again on a fresh evaluation. A failed answer is kept until its
   * arguments change or the surface is deleted, so a binding that re-resolves on every
   * render does not resend the same failing call. Without this, each render would send
   * one more request. A settled answer is also kept for the same reason.
   */
  readonly #settled = new Map<string, SettledAnswer>();
  /** functionCallIds of reactive calls not yet drained, in order. */
  readonly #queue: string[] = [];
  #counter = 0;

  constructor(config: NormalizedAgentFunctionsConfig) {
    this.#maxPending = config.maxPending;
    this.#settledLimit = config.maxPending * SETTLED_CACHE_FACTOR;
    this.#createId = config.createFunctionCallId;
    this.#onCallQueued = config.onCallQueued;
  }

  route(request: AgentFunctionRouteRequest): AgentFunctionRouteOutcome {
    const { scope, catalogId, functionName, args } = request;
    const key = callKey(scope.surfaceId, catalogId, functionName, args);
    if (scope.kind === "reactive") {
      const settled = this.#settled.get(key);
      if (settled !== undefined) return settled.outcome;
      const existing = this.#pendingReactive.get(key);
      if (existing !== undefined) return { kind: "pending", functionCallId: existing };
    } else {
      const memoized = scope.memo.states.get(key);
      if (memoized !== undefined) return memoOutcome(memoized);
    }

    if (this.#pending.size >= this.#maxPending) {
      return { kind: "refused", message: `Too many pending agent function calls (limit ${this.#maxPending})` };
    }
    const id = this.#nextId();
    if ("message" in id) return { kind: "refused", message: id.message };
    if (this.#pending.has(id.value)) {
      return { kind: "refused", message: `Agent function call id "${id.value}" is already pending` };
    }

    const message: A2UIRendererCallAgentFunctionMessage = {
      version: "1.0",
      callAgentFunction: {
        surfaceId: scope.surfaceId,
        functionCallId: id.value,
        callFunction: { "@call": functionName, catalogId, args: cloneJson(args) },
      },
    };
    const entry: PendingCall = { surfaceId: scope.surfaceId, kind: scope.kind, key, message };
    if (scope.kind === "reactive") {
      this.#pending.set(id.value, entry);
      this.#pendingReactive.set(key, id.value);
      this.#queue.push(id.value);
      this.#notifyQueued();
    } else {
      this.#pending.set(id.value, { ...entry, memo: scope.memo, continuation: scope.continuation });
      scope.memo.states.set(key, { state: "pending", functionCallId: id.value });
      scope.memo.outbox.push(message);
    }
    return { kind: "pending", functionCallId: id.value };
  }

  /** Settles a pending call with its response. Unknown or final ids are ignored. */
  settle(
    functionCallId: string,
    response: { value: JsonValue } | { error: { message: string } },
  ): AgentFunctionSettlement {
    const entry = this.#pending.get(functionCallId);
    if (entry === undefined) return { status: "ignored" };
    const outcome: SettledOutcome =
      "error" in response
        ? { kind: "failed", failure: { code: "EXPRESSION_ERROR", message: response.error.message, functionCallId } }
        : { kind: "value", value: cloneJson(response.value) };
    return this.#finish(functionCallId, entry, outcome);
  }

  /**
   * Cancels a pending call the host gave up on. The dependents see a failure,
   * remembered like any other failed answer, and a late response is ignored.
   * Core has no clock, so the host decides when a call has timed out.
   */
  cancel(functionCallId: string, reason: AgentFunctionCancelReason): AgentFunctionSettlement {
    const entry = this.#pending.get(functionCallId);
    if (entry === undefined) return { status: "ignored" };
    const message = reason === "TIMEOUT" ? "Agent function call timed out" : "Agent function call failed in transport";
    const settlement = this.#finish(functionCallId, entry, {
      kind: "failed",
      failure: { code: "EXPRESSION_ERROR", message, functionCallId },
    });
    return settlement.status === "settled" ? { ...settlement, status: "cancelled" } : settlement;
  }

  /**
   * Drops every pending call and every settled answer of a surface. The calls
   * are cancelled silently, so no error is reported for them.
   */
  cancelSurface(surfaceId: string): void {
    for (const [id, entry] of [...this.#pending]) {
      if (entry.surfaceId !== surfaceId) continue;
      this.#pending.delete(id);
      if (entry.kind === "reactive") this.#pendingReactive.delete(entry.key);
    }
    for (const [key, answer] of [...this.#settled]) {
      if (answer.surfaceId === surfaceId) this.#settled.delete(key);
    }
    for (let index = this.#queue.length - 1; index >= 0; index -= 1) {
      if (!this.#pending.has(this.#queue[index]!)) this.#queue.splice(index, 1);
    }
  }

  /** The surface a pending call belongs to, for transport route ownership. */
  surfaceOf(functionCallId: string): string | undefined {
    return this.#pending.get(functionCallId)?.surfaceId;
  }

  /**
   * Returns the queued reactive callAgentFunction messages in order and removes them from the
   * queue. With `takes`, only calls whose surface it accepts are taken; the others stay queued,
   * in order, for a later drain.
   */
  drain(takes?: (surfaceId: string) => boolean): A2UIRendererCallAgentFunctionMessage[] {
    const messages: A2UIRendererCallAgentFunctionMessage[] = [];
    const kept: string[] = [];
    for (const id of this.#queue) {
      const entry = this.#pending.get(id);
      if (entry === undefined) continue;
      if (takes === undefined || takes(entry.surfaceId)) messages.push(copyCallMessage(entry.message));
      else kept.push(id);
    }
    this.#queue.length = 0;
    this.#queue.push(...kept);
    return messages;
  }

  #finish(functionCallId: string, entry: PendingCall, outcome: SettledOutcome): AgentFunctionSettlement {
    this.#pending.delete(functionCallId);
    const continuation = entry.continuation;
    if (entry.kind === "reactive") {
      this.#pendingReactive.delete(entry.key);
      const index = this.#queue.indexOf(functionCallId);
      if (index >= 0) this.#queue.splice(index, 1);
      this.#remember(entry.key, { surfaceId: entry.surfaceId, outcome });
    } else {
      entry.memo?.states.set(entry.key, outcome.kind === "value"
        ? { state: "settled", value: outcome.value }
        : { state: "failed", failure: outcome.failure });
    }
    return {
      status: "settled",
      surfaceId: entry.surfaceId,
      ...(continuation === undefined ? {} : { continuation }),
    };
  }

  #remember(key: string, answer: SettledAnswer): void {
    this.#settled.delete(key);
    this.#settled.set(key, answer);
    while (this.#settled.size > this.#settledLimit) {
      const oldest = this.#settled.keys().next().value;
      if (oldest === undefined) break;
      this.#settled.delete(oldest);
    }
  }

  #notifyQueued(): void {
    try {
      this.#onCallQueued?.();
    } catch {
      // A hook must never change a result or the runtime's state.
    }
  }

  #nextId(): { value: string } | { message: string } {
    if (this.#createId === undefined) {
      this.#counter += 1;
      return { value: `agent-call-${this.#counter}` };
    }
    let id: unknown;
    try {
      id = this.#createId();
    } catch {
      return { message: "createFunctionCallId threw while creating an agent function call id" };
    }
    if (typeof id !== "string" || id.length === 0) {
      return { message: "createFunctionCallId must return a non-empty string" };
    }
    return { value: id };
  }
}

/** A defensive copy of an outbound message, so a host cannot change the queued call. */
function copyCallMessage(message: A2UIRendererCallAgentFunctionMessage): A2UIRendererCallAgentFunctionMessage {
  const { callFunction } = message.callAgentFunction;
  return {
    version: message.version,
    callAgentFunction: {
      surfaceId: message.callAgentFunction.surfaceId,
      functionCallId: message.callAgentFunction.functionCallId,
      callFunction: {
        "@call": callFunction["@call"],
        catalogId: callFunction.catalogId,
        ...(callFunction.args === undefined ? {} : { args: cloneJson(callFunction.args) }),
      },
    },
  };
}

function memoOutcome(state: ActionMemoState): AgentFunctionRouteOutcome {
  if (state.state === "pending") return { kind: "pending", functionCallId: state.functionCallId };
  if (state.state === "settled") return { kind: "value", value: state.value };
  return { kind: "failed", failure: state.failure };
}

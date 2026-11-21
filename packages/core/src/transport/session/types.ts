import type { WeaverActionResult, WeaverProcessResult, WeaverRuntime } from "../../runtime/index.js";
import type {
  A2UIRendererActionMessage,
  A2UIRendererCallAgentFunctionMessage,
  A2UIRendererCapabilities,
  A2UIRendererDataModel,
  A2UIRendererErrorMessage,
  A2UIRendererFunctionResponseMessage,
  A2UIValidationFailedRendererMessage,
  A2UIValidationFailureMappingError,
} from "../../protocol/index.js";
import type { MessageProcessorResult } from "../../message-processor/index.js";

/** Opaque host-assigned transport/session route key. Its string has no protocol meaning. */
export type A2UIRouteId = string;

export type A2UIRoutingError =
  | { code: "INVALID_ROUTE_ID" }
  | { code: "SURFACE_ROUTE_MISMATCH"; surfaceId: string }
  | { code: "SURFACE_ROUTE_UNKNOWN"; surfaceId: string }
  | { code: "ACTION_DELIVERY_UNAVAILABLE" }
  /** The result is not a callRendererFunction response. */
  | { code: "FUNCTION_RESPONSE_UNAVAILABLE" }
  | A2UIValidationFailureMappingError;

/** A rendererFunctionResponse the host must send on `routeId`. */
export interface A2UIFunctionResponseDelivery {
  routeId: A2UIRouteId;
  message: A2UIRendererFunctionResponseMessage;
}

/**
 * The result of an inbound message. A success is the runtime result, so a settled agent
 * call that resumed an action carries that action as `value.action`. A routing refusal
 * has no runtime state change. When the refused message is a callRendererFunction with a
 * string functionCallId, `functionResponse` is the error response the host must send back
 * on the inbound route. The routing error stays available for logging.
 */
export type A2UIRoutedProcessResult =
  | WeaverProcessResult
  | { ok: false; error: A2UIRoutingError; functionResponse?: A2UIFunctionResponseDelivery };

export type A2UIActionDeliveryResult =
  | { ok: true; value: { routeId: A2UIRouteId; message: A2UIRendererActionMessage; rendererDataModel?: A2UIRendererDataModel } }
  | { ok: false; error: A2UIRoutingError };

/**
 * A message the host sends back on a route. A function response is the reply to a
 * callRendererFunction, and a renderer error is the reply to a malformed call
 * envelope (its functionCallId is correlated, so surfaceId is never present).
 */
export type A2UIRoutedDelivery =
  | { routeId: A2UIRouteId; message: A2UIRendererActionMessage; rendererDataModel?: A2UIRendererDataModel }
  | {
      routeId: A2UIRouteId;
      message: A2UIValidationFailedRendererMessage | A2UIRendererErrorMessage | A2UIRendererFunctionResponseMessage;
    }
  /** A callAgentFunction the host must send on `routeId`. */
  | { routeId: A2UIRouteId; message: A2UIRendererCallAgentFunctionMessage };

export type A2UIActionCallDeliveryResult =
  | { ok: true; value: { routeId: A2UIRouteId; message: A2UIRendererCallAgentFunctionMessage }[] }
  | { ok: false; error: A2UIRoutingError };

export type A2UIValidationErrorDeliveryResult =
  | {
      ok: true;
      value: {
        routeId: A2UIRouteId;
        message: A2UIValidationFailedRendererMessage | A2UIRendererErrorMessage;
      };
    }
  | { ok: false; error: A2UIRoutingError };

export type A2UIFunctionResponseDeliveryResult =
  | { ok: true; value: A2UIFunctionResponseDelivery }
  | { ok: false; error: A2UIRoutingError };

export interface A2UITransportSession {
  processInbound(routeId: A2UIRouteId, input: unknown): A2UIRoutedProcessResult;
  getSurfaceRoute(surfaceId: string): A2UIRouteId | undefined;
  prepareActionDelivery(result: WeaverActionResult): A2UIActionDeliveryResult;
  /**
   * Prepares the callAgentFunction messages of an action result that is waiting on
   * agent calls, each on the route that owns its surface. The host sends them once.
   * A message whose surface has no route is cancelled with TRANSPORT_FAILED.
   */
  prepareActionCallDelivery(result: WeaverActionResult): A2UIActionCallDeliveryResult;
  /**
   * Takes the queued callAgentFunction messages whose surface `routeId` owns, in order.
   * Calls for other routes stay queued for their own drain. A call whose surface has no
   * route also stays queued, and the host cancels it with
   * runtime.cancelAgentFunctionCall(functionCallId, ...). The host sends each taken message.
   * If a send fails, it reports that with
   * runtime.cancelAgentFunctionCall(functionCallId, "TRANSPORT_FAILED").
   */
  drainOutbound(routeId: A2UIRouteId): A2UIRoutedDelivery[];
  /**
   * Prepares the reply for a failed inbound message. A callRendererFunction
   * envelope that failed schema validation with a functionCallId becomes a
   * generic INVALID_FUNCTION_CALL renderer error. Other failures map to a surface
   * validation error where possible.
   */
  prepareValidationErrorDelivery(
    routeId: A2UIRouteId,
    input: unknown,
    result: MessageProcessorResult,
    trustedSurfaceId?: string,
  ): A2UIValidationErrorDeliveryResult;
  /**
   * Prepares the rendererFunctionResponse for an ok callRendererFunction result.
   * The host must send it back on the route that delivered the call.
   */
  prepareFunctionResponseDelivery(
    routeId: A2UIRouteId,
    result: WeaverProcessResult,
  ): A2UIFunctionResponseDeliveryResult;
  getRendererCapabilities(): A2UIRendererCapabilities;
}

export interface A2UITransportSessionOptions {
  runtime: WeaverRuntime;
}

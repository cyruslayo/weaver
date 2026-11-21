import type { WeaverActionResult, WeaverRuntime } from "../../runtime/index.js";
import type {
  A2UIRendererActionMessage,
  A2UIRendererCapabilities,
  A2UIRendererDataModel,
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
  | A2UIValidationFailureMappingError;

export type A2UIRoutedProcessResult =
  | MessageProcessorResult
  | { ok: false; error: A2UIRoutingError };

export type A2UIActionDeliveryResult =
  | { ok: true; value: { routeId: A2UIRouteId; message: A2UIRendererActionMessage; rendererDataModel?: A2UIRendererDataModel } }
  | { ok: false; error: A2UIRoutingError };

export type A2UIRoutedDelivery =
  | { routeId: A2UIRouteId; message: A2UIRendererActionMessage; rendererDataModel?: A2UIRendererDataModel }
  | { routeId: A2UIRouteId; message: A2UIValidationFailedRendererMessage };

export type A2UIValidationErrorDeliveryResult =
  | { ok: true; value: { routeId: A2UIRouteId; message: A2UIValidationFailedRendererMessage } }
  | { ok: false; error: A2UIRoutingError };

export interface A2UITransportSession {
  processInbound(routeId: A2UIRouteId, input: unknown): A2UIRoutedProcessResult;
  getSurfaceRoute(surfaceId: string): A2UIRouteId | undefined;
  prepareActionDelivery(result: WeaverActionResult): A2UIActionDeliveryResult;
  prepareValidationErrorDelivery(
    routeId: A2UIRouteId,
    input: unknown,
    result: MessageProcessorResult,
    trustedSurfaceId?: string,
  ): A2UIValidationErrorDeliveryResult;
  getRendererCapabilities(): A2UIRendererCapabilities;
}

export interface A2UITransportSessionOptions {
  runtime: WeaverRuntime;
}

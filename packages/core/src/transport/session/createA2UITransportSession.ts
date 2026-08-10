import type { MessageProcessorResult } from "../../message-processor/index.js";
import type { A2UIServerMessage } from "../../protocol/index.js";
import { validateA2UIServerMessage } from "../../protocol/index.js";
import type {
  A2UIActionDeliveryResult,
  A2UIRouteId,
  A2UITransportSession,
  A2UITransportSessionOptions,
  A2UIValidationErrorDeliveryResult,
} from "./types.js";

/**
 * Creates transport-neutral route ownership around one runtime. Calls are
 * synchronous and are processed in adapter-supplied order; concurrent adapters
 * must serialize their own inbound messages.
 */
export function createA2UITransportSession(
  options: A2UITransportSessionOptions,
): A2UITransportSession {
  const routes = new Map<string, A2UIRouteId>();
  const { runtime } = options;

  return Object.freeze({
    processInbound(routeId: A2UIRouteId, input: unknown) {
      if (!isRouteId(routeId)) return { ok: false as const, error: { code: "INVALID_ROUTE_ID" as const } };

      const validation = validateA2UIServerMessage(input);
      if (validation.ok) {
        const surfaceId = getSurfaceId(validation.value);
        const owner = routes.get(surfaceId);
        if (owner !== undefined && owner !== routeId) {
          return { ok: false as const, error: { code: "SURFACE_ROUTE_MISMATCH" as const, surfaceId } };
        }
        if (owner === undefined && runtime.getSurface(surfaceId) !== undefined) {
          return { ok: false as const, error: { code: "SURFACE_ROUTE_UNKNOWN" as const, surfaceId } };
        }
      }

      const result = runtime.process(input);
      if (!result.ok) return result;
      if (result.value.operation === "surfaceCreated") routes.set(result.value.surfaceId, routeId);
      if (result.value.operation === "surfaceDeleted") routes.delete(result.value.surfaceId);
      return result;
    },

    getSurfaceRoute(surfaceId: string) {
      return routes.get(surfaceId);
    },

    prepareActionDelivery(result: Parameters<A2UITransportSession["prepareActionDelivery"]>[0]): A2UIActionDeliveryResult {
      if (!result.ok || result.value.kind !== "serverEvent") {
        return { ok: false, error: { code: "ACTION_DELIVERY_UNAVAILABLE" } };
      }
      const surfaceId = result.value.message.action.surfaceId;
      const routeId = routes.get(surfaceId);
      if (routeId === undefined) return { ok: false, error: { code: "SURFACE_ROUTE_UNKNOWN", surfaceId } };
      return {
        ok: true,
        value: structuredClone({
          routeId,
          message: result.value.message,
          ...(result.value.metadata === undefined
            ? {}
            : { clientDataModel: result.value.metadata.a2uiClientDataModel }),
        }),
      };
    },

    prepareValidationErrorDelivery(
      routeId: A2UIRouteId,
      input: unknown,
      result: MessageProcessorResult,
      trustedSurfaceId?: string,
    ): A2UIValidationErrorDeliveryResult {
      if (!isRouteId(routeId)) return { ok: false, error: { code: "INVALID_ROUTE_ID" } };
      const mapped = runtime.mapProcessFailureToValidationMessage({
        input,
        result,
        ...(trustedSurfaceId === undefined ? {} : { surfaceId: trustedSurfaceId }),
      });
      if (!mapped.ok) return mapped;
      return { ok: true, value: structuredClone({ routeId, message: mapped.value }) };
    },

    getClientCapabilities() {
      return structuredClone(runtime.getClientCapabilities());
    },
  });
}

function isRouteId(value: unknown): value is A2UIRouteId {
  return typeof value === "string" && value.length > 0;
}

function getSurfaceId(message: A2UIServerMessage): string {
  if ("createSurface" in message) return message.createSurface.surfaceId;
  if ("updateComponents" in message) return message.updateComponents.surfaceId;
  if ("updateDataModel" in message) return message.updateDataModel.surfaceId;
  return message.deleteSurface.surfaceId;
}

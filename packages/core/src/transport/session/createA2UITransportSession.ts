import { cloneJson } from "../../data-model/clone.js";
import type { MessageProcessorResult } from "../../message-processor/index.js";
import type { WeaverProcessResult } from "../../runtime/index.js";
import type { A2UIAgentMessage, A2UIRendererCallAgentFunctionMessage, JsonValue } from "../../protocol/index.js";
import { buildA2UIGenericRendererErrorMessage, validateA2UIAgentMessage } from "../../protocol/index.js";
import type {
  A2UIActionCallDeliveryResult,
  A2UIActionDeliveryResult,
  A2UIFunctionResponseDeliveryResult,
  A2UIRouteId,
  A2UIRoutedDelivery,
  A2UIRoutedProcessResult,
  A2UIRoutingError,
  A2UITransportSession,
  A2UITransportSessionOptions,
  A2UIValidationErrorDeliveryResult,
} from "./types.js";

/**
 * Creates transport-neutral route ownership around one runtime. Calls are
 * synchronous and are processed in adapter-supplied order; concurrent adapters
 * must serialize their own inbound messages.
 */
function cloneTransportJson<T>(value: T): T {
  // SAFETY: transport snapshots cloned here are JSON-shaped protocol values.
  return cloneJson(value as unknown as JsonValue) as unknown as T;
}

export function createA2UITransportSession(
  options: A2UITransportSessionOptions,
): A2UITransportSession {
  const routes = new Map<string, A2UIRouteId>();
  const { runtime } = options;

  return Object.freeze({
    processInbound(routeId: A2UIRouteId, input: unknown) {
      if (!isRouteId(routeId))
        return {
          ok: false as const,
          error: { code: "INVALID_ROUTE_ID" as const },
        };

      const validation = validateA2UIAgentMessage(input);
      const surfaceId = validation.ok ? getSurfaceId(validation.value) : undefined;
      if (surfaceId !== undefined) {
        const owner = routes.get(surfaceId);
        if (owner !== undefined && owner !== routeId) {
          return routingRefusal(routeId, validation, {
            code: "SURFACE_ROUTE_MISMATCH" as const,
            surfaceId,
          });
        }
        if (
          owner === undefined &&
          runtime.getSurface(surfaceId) !== undefined
        ) {
          return routingRefusal(routeId, validation, {
            code: "SURFACE_ROUTE_UNKNOWN" as const,
            surfaceId,
          });
        }
      }

      // A response settles a call that belongs to one surface, so it must arrive on that surface's route.
      if (validation.ok && "agentFunctionResponse" in validation.value) {
        const callSurface = runtime.getAgentFunctionCallSurface(validation.value.agentFunctionResponse.functionCallId);
        const callOwner = callSurface === undefined ? undefined : routes.get(callSurface);
        if (callSurface !== undefined && callOwner !== undefined && callOwner !== routeId) {
          return { ok: false as const, error: { code: "SURFACE_ROUTE_MISMATCH" as const, surfaceId: callSurface } };
        }
      }

      const result = runtime.process(input);
      if (!result.ok) return result;
      if (result.value.operation === "surfaceCreated")
        routes.set(result.value.surfaceId, routeId);
      if (result.value.operation === "surfaceDeleted")
        routes.delete(result.value.surfaceId);
      return result;
    },

    getSurfaceRoute(surfaceId: string) {
      return routes.get(surfaceId);
    },

    prepareActionDelivery(
      result: Parameters<A2UITransportSession["prepareActionDelivery"]>[0],
    ): A2UIActionDeliveryResult {
      if (!result.ok || result.value.kind !== "serverEvent") {
        return { ok: false, error: { code: "ACTION_DELIVERY_UNAVAILABLE" } };
      }
      const surfaceId = result.value.message.action.surfaceId;
      const routeId = routes.get(surfaceId);
      if (routeId === undefined)
        return {
          ok: false,
          error: { code: "SURFACE_ROUTE_UNKNOWN", surfaceId },
        };
      return {
        ok: true,
        value: cloneTransportJson({
          routeId,
          message: result.value.message,
          ...(result.value.metadata === undefined
            ? {}
            : { rendererDataModel: result.value.metadata.a2uiRendererDataModel }),
        }),
      };
    },

    prepareActionCallDelivery(result: Parameters<A2UITransportSession["prepareActionCallDelivery"]>[0]): A2UIActionCallDeliveryResult {
      if (!result.ok || result.value.kind !== "agentFunctionCalls") {
        return { ok: false, error: { code: "ACTION_DELIVERY_UNAVAILABLE" } };
      }
      const deliveries: { routeId: A2UIRouteId; message: A2UIRendererCallAgentFunctionMessage }[] = [];
      for (const message of result.value.messages) {
        const routeId = routes.get(message.callAgentFunction.surfaceId);
        if (routeId === undefined) {
          // No route owns the surface, so the call cannot be delivered. It is cancelled rather than left pending.
          runtime.cancelAgentFunctionCall(message.callAgentFunction.functionCallId, "TRANSPORT_FAILED");
          continue;
        }
        deliveries.push({ routeId, message: cloneTransportJson(message) });
      }
      return { ok: true, value: deliveries };
    },

    drainOutbound(routeId: A2UIRouteId): A2UIRoutedDelivery[] {
      if (!isRouteId(routeId)) return [];
      // Only the calls of surfaces this route owns are taken. Other routes' calls, and calls
      // whose surface has no route, stay queued.
      const messages = runtime.takeAgentFunctionCalls((surfaceId) => routes.get(surfaceId) === routeId);
      return messages.map((message) => ({ routeId, message: cloneTransportJson(message) }));
    },

    prepareValidationErrorDelivery(
      routeId: A2UIRouteId,
      input: unknown,
      result: MessageProcessorResult,
      trustedSurfaceId?: string,
    ): A2UIValidationErrorDeliveryResult {
      if (!isRouteId(routeId))
        return { ok: false, error: { code: "INVALID_ROUTE_ID" } };
      if (!result.ok && result.error.code === "PROTOCOL_VALIDATION_FAILED" && result.error.functionCallId !== undefined) {
        const issue = result.error.issues[0];
        const detail = issue === undefined ? "Invalid callRendererFunction" : `${issue.path}: ${issue.message}`;
        return {
          ok: true,
          value: cloneTransportJson({
            routeId,
            message: buildA2UIGenericRendererErrorMessage({
              code: "INVALID_FUNCTION_CALL",
              message: detail,
              functionCallId: result.error.functionCallId,
            }),
          }),
        };
      }
      const mapped = runtime.mapProcessFailureToValidationMessage({
        input,
        result,
        ...(trustedSurfaceId === undefined
          ? {}
          : { surfaceId: trustedSurfaceId }),
      });
      if (!mapped.ok) return mapped;
      return {
        ok: true,
        value: cloneTransportJson({ routeId, message: mapped.value }),
      };
    },

    prepareFunctionResponseDelivery(
      routeId: A2UIRouteId,
      result: WeaverProcessResult,
    ): A2UIFunctionResponseDeliveryResult {
      if (!isRouteId(routeId))
        return { ok: false, error: { code: "INVALID_ROUTE_ID" } };
      if (!result.ok || result.value.operation !== "rendererFunctionResponded")
        return { ok: false, error: { code: "FUNCTION_RESPONSE_UNAVAILABLE" } };
      return {
        ok: true,
        value: cloneTransportJson({ routeId, message: result.value.response }),
      };
    },

    getRendererCapabilities() {
      return cloneTransportJson(runtime.getRendererCapabilities());
    },
  });
}

/**
 * A routing refusal. A callRendererFunction must always be answered, so a refused
 * call also yields a rendererFunctionResponse on the inbound route. Its message is
 * the one Core gives an unknown surface, so the agent cannot tell whether the
 * surface exists or which route owns it. The routing error is still returned for
 * the host to log.
 */
function routingRefusal(
  routeId: A2UIRouteId,
  validation: ReturnType<typeof validateA2UIAgentMessage>,
  error: Extract<A2UIRoutingError, { surfaceId: string }>,
): A2UIRoutedProcessResult {
  if (!validation.ok || !("callRendererFunction" in validation.value)) return { ok: false, error };
  const { functionCallId } = validation.value.callRendererFunction;
  return {
    ok: false,
    error,
    functionResponse: {
      routeId,
      message: {
        version: "1.0",
        rendererFunctionResponse: {
          functionCallId,
          error: { code: "INVALID_FUNCTION_CALL", message: `Surface not found: ${error.surfaceId}` },
        },
      },
    },
  };
}

function isRouteId(value: unknown): value is A2UIRouteId {
  return typeof value === "string" && value.length > 0;
}

/**
 * The surface a message routes to. A callRendererFunction routes only when it
 * names a surface. Without one, Core answers from an isolated context.
 */
function getSurfaceId(message: A2UIAgentMessage): string | undefined {
  if ("createSurface" in message) return message.createSurface.surfaceId;
  if ("updateComponents" in message) return message.updateComponents.surfaceId;
  if ("updateDataModel" in message) return message.updateDataModel.surfaceId;
  if ("deleteSurface" in message) return message.deleteSurface.surfaceId;
  if ("callRendererFunction" in message) return message.callRendererFunction.surfaceId;
  return undefined;
}

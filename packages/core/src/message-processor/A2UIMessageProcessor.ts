import { AgentFunctionBroker, DEFAULT_MAX_PENDING } from "../agent-functions/index.js";
import { CatalogRegistry, type CatalogRegistryError } from "../catalog/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, FunctionRegistry } from "../functions/index.js";
import {
  validateA2UIAgentMessage,
  type A2UIAgentMessage,
  type A2UIComponent,
  type A2UIFunctionResponse,
  type A2UIRendererFunctionResponseMessage,
  type JsonObject,
  type JsonValue,
} from "../protocol/index.js";
import {
  SurfaceStore,
  type SurfaceStoreError,
  type SurfaceStoreResult,
  type SurfaceSnapshot,
} from "../surfaces/index.js";
import { componentCatalogId, functionCallCatalogId } from "../catalog/catalogResolution.js";
import { embeddedFunctionCalls } from "./embeddedCalls.js";
import { mapRendererFunctionError } from "./rendererFunctionCall.js";
import type { MessageProcessorResult, MessageProcessorSuccess } from "./types.js";

type DataModelOperation = "surfaceCreated" | "componentsUpdated" | "dataModelUpdated";

type CallRendererFunctionPayload = {
  surfaceId?: string;
  functionCallId: string;
  callFunction: { "@call": string; catalogId: string; args?: JsonObject };
};

export class A2UIMessageProcessor {
  /**
   * The evaluator runs callRendererFunction. Runtimes pass the evaluator that
   * holds their registered implementations. Without one, function calls run
   * against an empty registry, so they are refused as unregistered. The broker
   * holds the pending callAgentFunction calls that agentFunctionResponse settles.
   */
  constructor(
    private readonly store: SurfaceStore,
    private readonly catalogs: CatalogRegistry,
    private readonly functions: FunctionEvaluator = new FunctionEvaluator(catalogs, new FunctionRegistry(catalogs)),
    private readonly broker: AgentFunctionBroker = new AgentFunctionBroker({ maxPending: DEFAULT_MAX_PENDING }),
  ) {}

  process(input: unknown): MessageProcessorResult {
    const validation = validateA2UIAgentMessage(input);
    if (!validation.ok) {
      const functionCallId = callRendererFunctionId(input);
      return {
        ok: false,
        error: {
          code: "PROTOCOL_VALIDATION_FAILED",
          issues: validation.issues,
          ...(functionCallId === undefined ? {} : { functionCallId }),
        },
      };
    }

    return this.dispatch(validation.value);
  }

  private dispatch(message: A2UIAgentMessage): MessageProcessorResult {
    if ("createSurface" in message) return this.createSurface(message.createSurface);
    if ("updateComponents" in message) return this.updateComponents(message.updateComponents);
    if ("updateDataModel" in message) return this.updateDataModel(message.updateDataModel);
    if ("deleteSurface" in message) return this.deleteSurface(message.deleteSurface.surfaceId);
    if ("callRendererFunction" in message) {
      return this.callRendererFunction(message.callRendererFunction);
    }
    return this.agentFunctionResponse(message.agentFunctionResponse);
  }

  /**
   * Settles the pending callAgentFunction that the response names. An unknown or
   * already settled id is ignored, with nothing changed. A settled call notifies the
   * surface, so the bindings and checks that wait on it re-resolve.
   */
  private agentFunctionResponse(response: A2UIFunctionResponse): MessageProcessorResult {
    const { functionCallId } = response;
    const settlement = this.broker.settle(
      functionCallId,
      response.error === undefined ? { value: response.value ?? null } : { error: { message: response.error.message } },
    );
    if (settlement.status === "ignored") {
      return { ok: true, value: { operation: "agentFunctionIgnored", functionCallId } };
    }
    this.store.notifyAgentFunctionSettled(settlement.surfaceId, functionCallId);
    return {
      ok: true,
      value: {
        operation: "agentFunctionResolved",
        surfaceId: settlement.surfaceId,
        functionCallId,
        ...(settlement.continuation === undefined ? {} : { continuation: settlement.continuation }),
      },
    };
  }

  /**
   * Applies createSurface atomically. Surface, data model, and components are
   * validated before anything is stored. The data model is applied before the
   * components.
   */
  private createSurface(create: {
    surfaceId: string;
    catalogId?: string;
    sendDataModel?: boolean;
    components?: readonly A2UIComponent[];
    dataModel?: JsonObject;
  }): MessageProcessorResult {
    const catalogId = create.catalogId;
    if (catalogId !== undefined && !this.catalogs.has(catalogId)) {
      return this.catalogError({
        code: "CATALOG_NOT_FOUND",
        catalogId,
        message: "Catalog is not registered",
      });
    }
    // Duplicate lifecycle precedes component work.
    if (this.store.has(create.surfaceId)) {
      return this.storeError({ code: "INTEGRITY_ERROR", surfaceId: create.surfaceId });
    }
    const components = create.components ?? [];
    const invalid = this.validateComponents(components, catalogId);
    if (invalid !== undefined) return invalid;
    return this.withSurface(
      "surfaceCreated",
      create.surfaceId,
      this.store.create({
        surfaceId: create.surfaceId,
        ...(catalogId === undefined ? {} : { catalogId }),
        ...(create.sendDataModel === undefined ? {} : { sendDataModel: create.sendDataModel }),
        ...(create.dataModel === undefined ? {} : { dataModel: create.dataModel }),
        components,
      }),
    );
  }

  private updateComponents(update: {
    surfaceId: string;
    components: readonly A2UIComponent[];
  }): MessageProcessorResult {
    const surface = this.store.get(update.surfaceId);
    if (surface === undefined) {
      return this.storeError({ code: "SURFACE_NOT_FOUND", surfaceId: update.surfaceId });
    }
    const invalid = this.validateComponents(update.components, surface.catalogId);
    if (invalid !== undefined) return invalid;
    return this.withSurface(
      "componentsUpdated",
      update.surfaceId,
      this.store.updateComponents(update.surfaceId, update.components),
    );
  }

  private updateDataModel(update: {
    surfaceId: string;
    path?: string;
    value: JsonValue;
  }): MessageProcessorResult {
    const path = update.path ?? "/";
    const result =
      update.value === null
        ? this.removeData(update.surfaceId, path)
        : path === "/"
          ? this.store.replaceData(update.surfaceId, update.value)
          : this.store.setData(update.surfaceId, path, update.value);
    return this.withSurface("dataModelUpdated", update.surfaceId, result);
  }

  /**
   * A null value deletes the key at path, and a null value at `/` resets the
   * model to an empty object. Array elements are positional, so a null there
   * keeps the index and stores null, as the A2UI conformance suite requires.
   */
  private removeData(surfaceId: string, path: string): SurfaceStoreResult<SurfaceSnapshot> {
    if (path === "/") return this.store.replaceData(surfaceId, {});
    const removed = this.store.deleteData(surfaceId, path);
    if (!removed.ok && isArrayElementDeleteError(removed.error)) {
      return this.store.setData(surfaceId, path, null);
    }
    return removed;
  }

  private deleteSurface(surfaceId: string): MessageProcessorResult {
    const deletion = this.store.delete(surfaceId);
    if (!deletion.ok) return this.storeError(deletion.error);
    // Pending calls of a deleted surface are dropped silently, and their answers are never reported.
    this.broker.cancelSurface(surfaceId);
    return {
      ok: true,
      value: { operation: "surfaceDeleted", surfaceId },
    };
  }

  private withSurface(
    operation: DataModelOperation,
    surfaceId: string,
    result: SurfaceStoreResult<SurfaceSnapshot>,
  ): MessageProcessorResult {
    if (!result.ok) return this.storeError(result.error);
    const value: MessageProcessorSuccess = { operation, surfaceId, surface: result.value };
    return { ok: true, value };
  }

  private storeError(error: SurfaceStoreError): MessageProcessorResult {
    return { ok: false, error: { code: "SURFACE_STORE_ERROR", storeError: error } };
  }

  private catalogError(error: CatalogRegistryError): MessageProcessorResult {
    return { ok: false, error: { code: "CATALOG_REGISTRY_ERROR", catalogError: error } };
  }

  /**
   * Executes an agent-initiated callRendererFunction. Every outcome is an ok
   * result carrying a response for the host to send. Failures the agent can
   * cause, such as an unknown surface, catalog or function, are error responses,
   * not processing errors. The call is synchronous and Core sends nothing.
   *
   * With no surfaceId, the call runs against an isolated empty data model and
   * has no effect on any surface. With a surfaceId, it runs against that
   * surface's data model root and does not change the surface.
   */
  private callRendererFunction(call: CallRendererFunctionPayload): MessageProcessorResult {
    const { functionCallId, callFunction } = call;
    let dataContext: DataContext;
    // Nested calls default to the target surface's catalog. Without a surfaceId there is none.
    let surfaceCatalogId: string | undefined;
    if (call.surfaceId === undefined) {
      dataContext = DataContext.root({});
    } else {
      const surface = this.store.get(call.surfaceId);
      if (surface === undefined) {
        return rendererFunctionResponse({
          functionCallId,
          error: { code: "INVALID_FUNCTION_CALL", message: `Surface not found: ${call.surfaceId}` },
        });
      }
      dataContext = DataContext.root(surface.dataModel);
      surfaceCatalogId = surface.catalogId;
    }

    const catalogId = callFunction.catalogId;
    if (!this.catalogs.has(catalogId)) {
      return rendererFunctionResponse({
        functionCallId,
        error: { code: "INVALID_FUNCTION_CALL", message: `Catalog not found: ${catalogId}` },
      });
    }

    const evaluated = this.functions.evaluateAgentCall(
      catalogId,
      {
        "@call": callFunction["@call"],
        ...(callFunction.args === undefined ? {} : { args: callFunction.args }),
      },
      dataContext,
      surfaceCatalogId,
    );
    if (!evaluated.ok) {
      const mapped = mapRendererFunctionError(evaluated.error);
      return rendererFunctionResponse({
        functionCallId,
        error: { code: mapped.code, message: mapped.message },
      });
    }
    return rendererFunctionResponse({ functionCallId, value: evaluated.value ?? null });
  }

  /**
   * Validates components against their resolved catalogs, and every FunctionCall inside them against
   * the catalog it resolves to. Runs before anything is stored, so a failure changes nothing.
   * A component resolves to its @catalogId or the surface default. A call resolves to its own
   * catalogId or the surface default, never to its enclosing component's catalog.
   */
  private validateComponents(
    components: readonly A2UIComponent[],
    surfaceCatalogId: string | undefined,
  ): MessageProcessorResult | undefined {
    for (const component of components) {
      const componentCatalog = componentCatalogId(component, surfaceCatalogId);
      if (componentCatalog === undefined) {
        return this.resolutionFailure(component.id, "", "Component names no @catalogId and the surface has no default catalogId");
      }
      const validation = this.catalogs.validateComponent(componentCatalog, component);
      if (!validation.ok) return this.catalogError(validation.error);
      for (const embedded of embeddedFunctionCalls(component)) {
        const failure = this.validateEmbeddedCall(component.id, surfaceCatalogId, embedded.call, embedded.path);
        if (failure !== undefined) return failure;
      }
    }
    return undefined;
  }

  private validateEmbeddedCall(
    sourceComponentId: string,
    surfaceCatalogId: string | undefined,
    call: JsonObject,
    path: string,
  ): MessageProcessorResult | undefined {
    // @index is a reserved system function with no catalog, so it is not resolved.
    if (call["@call"] === "@index") return undefined;
    const callCatalog = functionCallCatalogId(call, surfaceCatalogId);
    if (callCatalog === undefined) {
      return this.resolutionFailure(sourceComponentId, path, "FunctionCall names no catalogId and the surface has no default catalogId");
    }
    if (!this.catalogs.has(callCatalog)) {
      return this.catalogError({ code: "CATALOG_NOT_FOUND", catalogId: callCatalog, message: "Catalog is not registered" });
    }
    const validation = this.catalogs.validateFunctionCall(callCatalog, call);
    return validation.ok ? undefined : this.catalogError(validation.error);
  }

  private resolutionFailure(sourceComponentId: string, path: string, message: string): MessageProcessorResult {
    return { ok: false, error: { code: "CATALOG_RESOLUTION_FAILED", sourceComponentId, path, message } };
  }
}

/** Wraps one response body as an ok result. A semantic failure is still ok, because the host must send its error. */
function rendererFunctionResponse(
  body: A2UIRendererFunctionResponseMessage["rendererFunctionResponse"],
): MessageProcessorResult {
  return {
    ok: true,
    value: {
      operation: "rendererFunctionResponded",
      response: { version: "1.0", rendererFunctionResponse: body },
    },
  };
}

/** The functionCallId of a callRendererFunction envelope, when it is a string. Used only to correlate an envelope failure. */
function callRendererFunctionId(input: unknown): string | undefined {
  if (!isRecord(input) || !isRecord(input.callRendererFunction)) return undefined;
  const functionCallId = input.callRendererFunction.functionCallId;
  return typeof functionCallId === "string" ? functionCallId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayElementDeleteError(error: SurfaceStoreError): boolean {
  return (
    error.code === "DATA_MODEL_ERROR" &&
    error.dataModelError.code === "ARRAY_INDEX_DELETE_UNSUPPORTED"
  );
}

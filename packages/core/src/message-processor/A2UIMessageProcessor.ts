import { CatalogRegistry, type CatalogRegistryError } from "../catalog/index.js";
import {
  validateA2UIAgentMessage,
  type A2UIAgentMessage,
  type A2UIComponent,
  type JsonObject,
  type JsonValue,
} from "../protocol/index.js";
import {
  SurfaceStore,
  type SurfaceStoreError,
  type SurfaceStoreResult,
  type SurfaceSnapshot,
} from "../surfaces/index.js";
import type { UnsupportedFeature } from "./errors.js";
import type { MessageProcessorResult, MessageProcessorSuccess } from "./types.js";

type DataModelOperation = "surfaceCreated" | "componentsUpdated" | "dataModelUpdated";

export class A2UIMessageProcessor {
  constructor(
    private readonly store: SurfaceStore,
    private readonly catalogs: CatalogRegistry,
  ) {}

  process(input: unknown): MessageProcessorResult {
    const validation = validateA2UIAgentMessage(input);
    if (!validation.ok) {
      return {
        ok: false,
        error: { code: "PROTOCOL_VALIDATION_FAILED", issues: validation.issues },
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
      return this.unsupported(
        "callRendererFunction",
        "callRendererFunction is valid A2UI v1.0 but remote function calls are not supported yet",
      );
    }
    return this.unsupported(
      "agentFunctionResponse",
      "agentFunctionResponse is valid A2UI v1.0 but remote function responses are not supported yet",
    );
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
    if (create.catalogId === undefined) {
      return this.unsupported(
        "createSurface.catalogId",
        "createSurface without catalogId requires multi-catalog support, which is not available yet",
      );
    }
    const catalogId = create.catalogId;
    if (!this.catalogs.has(catalogId)) {
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
    for (const component of components) {
      const validation = this.catalogs.validateComponent(catalogId, component);
      if (!validation.ok) return this.catalogError(validation.error);
    }
    return this.withSurface(
      "surfaceCreated",
      create.surfaceId,
      this.store.create({
        surfaceId: create.surfaceId,
        catalogId,
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
    for (const component of update.components) {
      const validation = this.catalogs.validateComponent(surface.catalogId, component);
      if (!validation.ok) return this.catalogError(validation.error);
    }
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

  private unsupported(feature: UnsupportedFeature, message: string): MessageProcessorResult {
    return { ok: false, error: { code: "UNSUPPORTED_FEATURE", feature, message } };
  }
}

function isArrayElementDeleteError(error: SurfaceStoreError): boolean {
  return (
    error.code === "DATA_MODEL_ERROR" &&
    error.dataModelError.code === "ARRAY_INDEX_DELETE_UNSUPPORTED"
  );
}

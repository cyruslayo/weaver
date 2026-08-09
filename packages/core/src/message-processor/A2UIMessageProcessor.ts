import {
  validateA2UIServerMessage,
  type A2UIServerMessage,
  type JsonValue,
} from "../protocol/index.js";
import { SurfaceStore, type SurfaceStoreResult, type SurfaceSnapshot } from "../surfaces/index.js";
import type { MessageProcessorResult, MessageProcessorSuccess } from "./types.js";

export class A2UIMessageProcessor {
  constructor(private readonly store: SurfaceStore) {}

  process(input: unknown): MessageProcessorResult {
    const validation = validateA2UIServerMessage(input);
    if (!validation.ok) {
      return {
        ok: false,
        error: { code: "PROTOCOL_VALIDATION_FAILED", issues: validation.issues },
      };
    }

    return this.dispatch(validation.value);
  }

  private dispatch(message: A2UIServerMessage): MessageProcessorResult {
    if ("createSurface" in message) {
      const create = message.createSurface;
      return this.withSurface(
        "surfaceCreated",
        create.surfaceId,
        this.store.create({
          surfaceId: create.surfaceId,
          catalogId: create.catalogId,
          ...(create.theme === undefined ? {} : { theme: create.theme }),
          ...(create.sendDataModel === undefined
            ? {}
            : { sendDataModel: create.sendDataModel }),
        }),
      );
    }

    if ("updateComponents" in message) {
      const update = message.updateComponents;
      return this.withSurface(
        "componentsUpdated",
        update.surfaceId,
        this.store.updateComponents(update.surfaceId, update.components),
      );
    }

    if ("updateDataModel" in message) {
      const update = message.updateDataModel;
      const path = update.path ?? "/";
      const hasValue = Object.prototype.hasOwnProperty.call(update, "value");
      const result = hasValue
        ? path === "/"
          ? this.store.replaceData(update.surfaceId, update.value as JsonValue)
          : this.store.setData(update.surfaceId, path, update.value as JsonValue)
        : this.store.deleteData(update.surfaceId, path);
      return this.withSurface("dataModelUpdated", update.surfaceId, result);
    }

    const deletion = this.store.delete(message.deleteSurface.surfaceId);
    if (!deletion.ok) return this.storeError(deletion.error);
    return {
      ok: true,
      value: { operation: "surfaceDeleted", surfaceId: message.deleteSurface.surfaceId },
    };
  }

  private withSurface(
    operation: "surfaceCreated" | "componentsUpdated" | "dataModelUpdated",
    surfaceId: string,
    result: SurfaceStoreResult<SurfaceSnapshot>,
  ): MessageProcessorResult {
    if (!result.ok) return this.storeError(result.error);
    const value: MessageProcessorSuccess = { operation, surfaceId, surface: result.value };
    return { ok: true, value };
  }

  private storeError(error: import("../surfaces/index.js").SurfaceStoreError): MessageProcessorResult {
    return { ok: false, error: { code: "SURFACE_STORE_ERROR", storeError: error } };
  }
}

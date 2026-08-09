import type { CatalogRegistry, DynamicPropertyKind } from "../catalog/index.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import { DataContext, isDataPathBinding } from "../data-context/index.js";
import type { JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot, SurfaceStore } from "../surfaces/index.js";
import type { InputBindingWriteResult, InputBindingWriteRequest } from "./types.js";

function compatible(kind: DynamicPropertyKind, value: unknown): value is JsonValue {
  switch (kind) {
    case "dynamicString": return typeof value === "string";
    case "dynamicNumber": return typeof value === "number" && Number.isFinite(value);
    case "dynamicBoolean": return typeof value === "boolean";
    case "dynamicStringList": return Array.isArray(value) && value.every((entry) => typeof entry === "string");
  }
}

function actualType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function contextFor(surface: SurfaceSnapshot, instance: ResolvedComponentInstance) {
  const root = DataContext.root(surface.dataModel);
  if (instance.scopePath === "/") return { ok: true as const, value: root };

  const separator = instance.scopePath.lastIndexOf("/");
  const indexToken = instance.scopePath.slice(separator + 1);
  const index = instance.collectionIndex;
  if (separator < 0 || index === undefined || indexToken !== String(index)) {
    return { ok: false as const, error: { code: "INVALID_COLLECTION_INDEX" as const, index: index ?? Number.NaN } };
  }
  return root.createCollectionItemContext(instance.scopePath.slice(0, separator) || "/", index);
}

/** Performs one catalog- and binding-validated local DataModel write. */
export class InputBindingWriter {
  constructor(
    private readonly surfaceStore: SurfaceStore,
    private readonly catalogRegistry: CatalogRegistry,
  ) {}

  write({ surfaceId, instance, property, value }: InputBindingWriteRequest): InputBindingWriteResult {
    const surface = this.surfaceStore.get(surfaceId);
    if (surface === undefined) return { ok: false, error: { code: "SURFACE_NOT_FOUND", surfaceId } };

    // Scope comes from the derived instance; the write contract always comes from current store state.
    const component = surface.components[instance.sourceComponentId];
    if (component === undefined) {
      return { ok: false, error: { code: "SOURCE_COMPONENT_NOT_FOUND", surfaceId, sourceComponentId: instance.sourceComponentId } };
    }
    if (!Object.hasOwn(component, property)) {
      return { ok: false, error: { code: "INPUT_PROPERTY_NOT_FOUND", sourceComponentId: instance.sourceComponentId, property } };
    }

    const metadata = this.catalogRegistry.getDynamicProperties(surface.catalogId, component.component);
    if (!metadata.ok) return { ok: false, error: { code: "CATALOG_REGISTRY_ERROR", cause: metadata.error } };
    const dynamic = metadata.value.find((definition) => definition.property === property);
    if (dynamic === undefined) {
      return { ok: false, error: { code: "INPUT_PROPERTY_NOT_DYNAMIC", sourceComponentId: instance.sourceComponentId, property } };
    }

    const binding = component[property];
    if (!isDataPathBinding(binding)) {
      return { ok: false, error: { code: "INPUT_PROPERTY_NOT_BOUND", sourceComponentId: instance.sourceComponentId, property } };
    }

    const context = contextFor(surface, instance);
    if (!context.ok) return { ok: false, error: { code: "BINDING_PATH_RESOLUTION_FAILED", cause: context.error } };
    const path = context.value.resolveBindingPath(binding);
    if (!path.ok) return { ok: false, error: { code: "BINDING_PATH_RESOLUTION_FAILED", cause: path.error } };

    if (!compatible(dynamic.valueKind, value)) {
      return { ok: false, error: {
        code: "INPUT_VALUE_TYPE_MISMATCH", sourceComponentId: instance.sourceComponentId,
        property, expected: dynamic.valueKind, actual: actualType(value),
      } };
    }

    const mutation = this.surfaceStore.setData(surfaceId, path.value, value);
    if (!mutation.ok) return { ok: false, error: { code: "SURFACE_STORE_ERROR", cause: mutation.error } };
    return { ok: true, value: {
      surfaceId, sourceComponentId: instance.sourceComponentId, property, path: path.value,
      value: Array.isArray(value) ? [...value] : value,
    } };
  }
}

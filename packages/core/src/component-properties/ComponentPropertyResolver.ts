import type {
  CatalogRegistry, CatalogRegistryError, DynamicPropertyKind, DynamicValueLocationSegment,
} from "../catalog/index.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import { DataContext, isDataPathBinding } from "../data-context/index.js";
import { FunctionEvaluator } from "../functions/index.js";
import type { FunctionEvaluationError } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type { ComponentPropertyError } from "./errors.js";
import type {
  ComponentInstanceTreeInput,
  ComponentPropertyIssue,
  ComponentPropertyLocationSegment,
  ComponentPropertyResult,
  ComponentPropertyTreeResult,
  HydratedComponentInstance,
  HydratedInstanceRelationship,
  HydratedValue,
  ResolvedComponentProperties,
  UnresolvedProperty,
} from "./types.js";

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson) as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)])) as T;
}

function clonePlain<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clonePlain) as T;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, clonePlain(entry)])) as T;
}

function isFunctionCall(value: JsonValue): value is JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object" &&
    typeof value.call === "string" && value.args !== null &&
    !Array.isArray(value.args) && typeof value.args === "object";
}

function readablePath(location: readonly ComponentPropertyLocationSegment[]): string {
  return "/" + location.map((segment) => segment.kind === "property"
    ? segment.name.replaceAll("~", "~0").replaceAll("/", "~1")
    : String(segment.index)).join("/");
}

function nestedLocation(location: readonly ComponentPropertyLocationSegment[]) {
  return location.length <= 1 ? {} : {
    location: location.map((segment) => ({ ...segment })),
    path: readablePath(location),
  };
}

function functionError(
  sourceComponentId: string,
  property: string,
  error: FunctionEvaluationError,
  location: readonly ComponentPropertyLocationSegment[],
): ComponentPropertyIssue {
  return {
    code: "FUNCTION_EVALUATION_FAILED",
    sourceComponentId,
    property,
    error,
    ...nestedLocation(location),
  };
}

function compatible(kind: DynamicPropertyKind, value: JsonValue): boolean {
  switch (kind) {
    case "dynamicString": return typeof value === "string";
    case "dynamicNumber": return typeof value === "number" && Number.isFinite(value);
    case "dynamicBoolean": return typeof value === "boolean";
    case "dynamicStringList": return Array.isArray(value) && value.every((entry) => typeof entry === "string");
  }
}

function catalogFailure(cause: CatalogRegistryError): ComponentPropertyError {
  return { code: "CATALOG_PROPERTY_METADATA_FAILED", message: cause.message, cause };
}

/** Hydrates catalog-declared dynamic properties, evaluating catalog functions through the evaluator. */
export class ComponentPropertyResolver {
  constructor(
    private readonly catalogs: CatalogRegistry,
    private readonly functionEvaluator: FunctionEvaluator,
  ) {}

  resolve(
    instance: ResolvedComponentInstance,
    dataContext: DataContext,
    catalogId: string,
  ): ComponentPropertyResult {
    const structure = this.catalogs.getComponentStructure(catalogId, instance.component);
    if (!structure.ok) return { ok: false, error: catalogFailure(structure.error) };
    const structuralMetadata = this.catalogs.getComponentStructureLocations(catalogId, instance.component);
    if (!structuralMetadata.ok) return { ok: false, error: catalogFailure(structuralMetadata.error) };
    const metadata = this.catalogs.getDynamicValueLocations(catalogId, instance.component);
    if (!metadata.ok) return { ok: false, error: catalogFailure(metadata.error) };

    const properties: ResolvedComponentProperties = {};
    const unresolved: UnresolvedProperty[] = [];
    const issues: ComponentPropertyIssue[] = [];

    for (const [property, original] of Object.entries(instance.definition)) {
      if (property === "id" || property === "component") continue;
      properties[property] = cloneJson(original);
    }

    const hydrateValue = (
      original: JsonValue,
      valueKind: DynamicPropertyKind,
      location: readonly ComponentPropertyLocationSegment[],
    ): HydratedValue => {
      const property = location[0]?.kind === "property" ? location[0].name : "";
      let value: JsonValue | undefined;
      let functionOwned = false;
      if (isFunctionCall(original)) {
        const evaluated = this.functionEvaluator.evaluate(catalogId, original, dataContext);
        if (!evaluated.ok) {
          unresolved.push({
            property, reason: "FUNCTION_EVALUATION_FAILED", functionCall: cloneJson(original),
            ...nestedLocation(location),
          });
          issues.push(functionError(instance.sourceComponentId, property, evaluated.error, location));
          return undefined;
        }
        value = evaluated.value;
        functionOwned = true;
      } else if (isDataPathBinding(original)) {
        const resolved = dataContext.resolveBinding(original);
        value = resolved.ok ? resolved.value : undefined;
      } else {
        value = cloneJson(original);
      }

      if (value !== undefined && !compatible(valueKind, value)) {
        issues.push({
          code: "DYNAMIC_VALUE_TYPE_MISMATCH", sourceComponentId: instance.sourceComponentId,
          property, expected: valueKind, ...nestedLocation(location),
        });
        return value === null ? null : undefined;
      }
      return value === undefined ? undefined : functionOwned ? clonePlain(value) : cloneJson(value);
    };

    const apply = (
      schemaPath: readonly DynamicValueLocationSegment[],
      offset: number,
      original: JsonValue,
      target: HydratedValue,
      runtimePath: ComponentPropertyLocationSegment[],
      valueKind: DynamicPropertyKind,
    ): HydratedValue => {
      if (offset === schemaPath.length) return hydrateValue(original, valueKind, runtimePath);
      const segment = schemaPath[offset]!;
      if (segment.kind === "property") {
        if (original === null || Array.isArray(original) || typeof original !== "object" ||
          target === null || Array.isArray(target) || typeof target !== "object" ||
          !Object.hasOwn(original, segment.name)) return target;
        const originalChild = original[segment.name]!;
        const targetObject = target as { [key: string]: HydratedValue };
        targetObject[segment.name] = apply(schemaPath, offset + 1, originalChild, targetObject[segment.name],
          [...runtimePath, { kind: "property", name: segment.name }], valueKind);
        return target;
      }
      if (!Array.isArray(original) || !Array.isArray(target)) return target;
      for (let index = 0; index < original.length; index += 1) {
        target[index] = apply(schemaPath, offset + 1, original[index]!, target[index],
          [...runtimePath, { kind: "arrayIndex", index }], valueKind);
      }
      return target;
    };

    for (const location of metadata.value) {
      const first = location.path[0];
      if (first?.kind !== "property" || !Object.hasOwn(instance.definition, first.name)) continue;
      properties[first.name] = apply(location.path, 1, instance.definition[first.name]!, properties[first.name],
        [{ kind: "property", name: first.name }], location.valueKind);
    }

    const removeStructural = (
      target: HydratedValue,
      path: readonly DynamicValueLocationSegment[],
      offset: number,
    ): void => {
      const segment = path[offset];
      if (segment === undefined) return;
      if (segment.kind === "property") {
        if (target === null || Array.isArray(target) || typeof target !== "object") return;
        if (offset === path.length - 1) {
          delete target[segment.name];
          return;
        }
        if (Object.hasOwn(target, segment.name)) removeStructural(target[segment.name], path, offset + 1);
        return;
      }
      if (!Array.isArray(target)) return;
      for (const item of target) removeStructural(item, path, offset + 1);
    };
    for (const location of structuralMetadata.value) removeStructural(properties, location.path, 0);

    return { ok: true, value: { properties, unresolved, issues } };
  }

  resolveTree(surface: SurfaceSnapshot, instances: ComponentInstanceTreeInput): ComponentPropertyTreeResult {
    if (!instances.ready || instances.root === undefined) {
      return {
        ok: true,
        value: { ready: false, instanceIssues: clonePlain(instances.issues), issues: [] },
      };
    }

    const issues: ComponentPropertyIssue[] = [];
    const hydrate = (
      instance: ResolvedComponentInstance,
      context: DataContext,
    ): ComponentPropertyResult<HydratedComponentInstance> => {
      const own = this.resolve(instance, context, surface.catalogId);
      if (!own.ok) return own;
      issues.push(...own.value.issues.map((issue) => ({ ...issue })));
      const relationships: HydratedInstanceRelationship[] = [];

      for (const relationship of instance.relationships) {
        if (relationship.kind === "single") {
          if (relationship.child === undefined) {
            relationships.push({ kind: "single", property: relationship.property,
              location: relationship.location.map((segment) => ({ ...segment })) });
          } else {
            const child = hydrate(relationship.child, context);
            if (!child.ok) return child;
            relationships.push({ kind: "single", property: relationship.property,
              location: relationship.location.map((segment) => ({ ...segment })), child: child.value });
          }
          continue;
        }
        if (relationship.kind === "list") {
          const children: HydratedComponentInstance[] = [];
          for (const childInstance of relationship.children) {
            const child = hydrate(childInstance, context);
            if (!child.ok) return child;
            children.push(child.value);
          }
          relationships.push({ kind: "list", property: relationship.property,
            location: relationship.location.map((segment) => ({ ...segment })), children });
          continue;
        }

        const children: HydratedComponentInstance[] = [];
        for (const childInstance of relationship.children) {
          const index = childInstance.collectionIndex;
          const childContext = index === undefined
            ? { ok: false as const, error: { code: "INVALID_COLLECTION_INDEX" as const, index: Number.NaN } }
            : context.createCollectionItemContext(relationship.collectionPath, index);
          if (!childContext.ok) {
            return {
              ok: false,
              error: {
                code: "DATA_CONTEXT_RECONSTRUCTION_FAILED",
                message: "Could not reconstruct the component instance data scope",
                cause: {
                  sourceComponentId: childInstance.sourceComponentId,
                  scopePath: childInstance.scopePath,
                  cause: { ...childContext.error },
                },
              },
            };
          }
          const child = hydrate(childInstance, childContext.value);
          if (!child.ok) return child;
          children.push(child.value);
        }
        relationships.push({
          kind: "template",
          property: relationship.property,
          location: relationship.location.map((segment) => ({ ...segment })),
          collectionPath: relationship.collectionPath,
          children,
        });
      }

      return {
        ok: true,
        value: {
          sourceComponentId: instance.sourceComponentId,
          component: instance.component,
          scopePath: instance.scopePath,
          ...(instance.collectionIndex === undefined ? {} : { collectionIndex: instance.collectionIndex }),
          properties: own.value.properties,
          relationships,
          unresolved: own.value.unresolved,
        },
      };
    };

    const root = hydrate(instances.root, DataContext.root(surface.dataModel));
    if (!root.ok) return root;
    return {
      ok: true,
      value: {
        ready: true,
        root: root.value,
        instanceIssues: clonePlain(instances.issues),
        issues,
      },
    };
  }
}

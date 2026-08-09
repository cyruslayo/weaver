import type { CatalogRegistry, CatalogRegistryError, DynamicPropertyKind } from "../catalog/index.js";
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
  ComponentPropertyResult,
  ComponentPropertyTreeResult,
  HydratedComponentInstance,
  HydratedInstanceRelationship,
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

function functionError(
  sourceComponentId: string,
  property: string,
  error: FunctionEvaluationError,
): ComponentPropertyIssue {
  return {
    code: "FUNCTION_EVALUATION_FAILED",
    sourceComponentId,
    property,
    error,
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
    const metadata = this.catalogs.getDynamicProperties(catalogId, instance.component);
    if (!metadata.ok) return { ok: false, error: catalogFailure(metadata.error) };

    const structural = new Set([...structure.value.singleChildFields, ...structure.value.childListFields]);
    const dynamic = new Map(metadata.value.map((definition) => [definition.property, definition.valueKind]));
    const properties: ResolvedComponentProperties = {};
    const unresolved: UnresolvedProperty[] = [];
    const issues: ComponentPropertyIssue[] = [];

    for (const [property, original] of Object.entries(instance.definition)) {
      if (property === "id" || property === "component" || structural.has(property)) continue;
      const valueKind = dynamic.get(property);
      if (valueKind === undefined) {
        properties[property] = cloneJson(original);
        continue;
      }

      let value: JsonValue | undefined;
      let functionOwned = false;
      if (isFunctionCall(original)) {
        const evaluated = this.functionEvaluator.evaluate(catalogId, original, dataContext);
        if (!evaluated.ok) {
          properties[property] = undefined;
          unresolved.push({
            property,
            reason: "FUNCTION_EVALUATION_FAILED",
            functionCall: cloneJson(original),
          });
          issues.push(functionError(instance.sourceComponentId, property, evaluated.error));
          continue;
        }
        // The evaluator already owns argument binding, nested calls, and return-contract
        // validation and returns defensively cloned results; only the destination
        // dynamic-property rules run here.
        value = evaluated.value;
        functionOwned = true;
      } else {
        value = cloneJson(original);
        if (isDataPathBinding(original)) {
          const resolved = dataContext.resolveBinding(original);
          if (!resolved.ok) {
            // Components were catalog-valid; an invalid scoped path remains unavailable to rendering.
            value = undefined;
          } else {
            value = resolved.value;
          }
        }
      }

      if (value !== undefined && !compatible(valueKind, value)) {
        issues.push({
          code: "DYNAMIC_VALUE_TYPE_MISMATCH",
          sourceComponentId: instance.sourceComponentId,
          property,
          expected: valueKind,
        });
        // Explicit null remains distinguishable; other incompatible values are withheld.
        properties[property] = value === null ? null : undefined;
      } else {
        properties[property] = value === undefined ? undefined : functionOwned ? value : cloneJson(value);
      }
    }

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
            relationships.push({ kind: "single", property: relationship.property });
          } else {
            const child = hydrate(relationship.child, context);
            if (!child.ok) return child;
            relationships.push({ kind: "single", property: relationship.property, child: child.value });
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
          relationships.push({ kind: "list", property: relationship.property, children });
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

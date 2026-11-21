import type {
  CatalogRegistry,
  CatalogRegistryError,
  DynamicPropertyKind,
  DynamicValueLocationSegment,
} from "../catalog/index.js";
import type { AgentFunctionScope } from "../agent-functions/types.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import { cloneJson } from "../data-model/clone.js";
import { DataContext } from "../data-context/index.js";
import {
  coerceDynamicBoolean,
  FunctionEvaluator,
  isDataBinding,
  isFunctionCall,
  unescapeLiteralDynamicValue,
} from "../functions/index.js";
import type { FunctionEvaluationError } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type { ComponentPropertyError } from "./errors.js";
import type {
  ComponentInstanceTreeInput,
  ResolvedAccessibility,
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

function clonePlain<T>(value: T): T {
  // SAFETY: all clonePlain callers pass JSON-shaped issue/value snapshots.
  return cloneJson(value as unknown as JsonValue) as T;
}

/**
 * Envelope keys are component-level mixins, not catalog properties. Resolved
 * accessibility is returned separately; the rest are stripped from properties.
 */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  "id",
  "component",
  "@catalogId",
  "@accessibility",
  "@metadata",
  "@checks",
]);
const ACCESSIBILITY_LIVE: ReadonlySet<string> = new Set(["off", "polite", "assertive"]);
/** Envelope mixin pairs where the @-form and the bare form may not coexist. */
const ENVELOPE_PAIRS: readonly (readonly [string, string])[] = [
  ["@accessibility", "accessibility"],
  ["@checks", "checks"],
  ["@metadata", "metadata"],
  ["@catalogId", "catalogId"],
];

function readablePath(
  location: readonly ComponentPropertyLocationSegment[],
): string {
  return (
    "/" +
    location
      .map((segment) =>
        segment.kind === "property"
          ? segment.name.replaceAll("~", "~0").replaceAll("/", "~1")
          : String(segment.index),
      )
      .join("/")
  );
}

function nestedLocation(location: readonly ComponentPropertyLocationSegment[]) {
  return location.length <= 1
    ? {}
    : {
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

function compatible(kind: DynamicPropertyKind | "dynamicValue", value: JsonValue): boolean {
  switch (kind) {
    case "dynamicString":
      return typeof value === "string";
    case "dynamicNumber":
      return typeof value === "number" && Number.isFinite(value);
    case "dynamicBoolean":
      return typeof value === "boolean";
    case "dynamicValue":
      // Any JSON type; literal objects are checked and unescaped by the caller.
      return true;
    case "dynamicStringList":
      return (
        Array.isArray(value) &&
        value.every((entry) => typeof entry === "string")
      );
  }
}

/**
 * Rejects envelope conflicts before any evaluation: a component carrying both the
 * @-form and the bare form of a mixin, or a @catalogId that is not the surface catalog.
 */
function checkEnvelope(
  instance: ResolvedComponentInstance,
  catalogId: string,
  catalogs: CatalogRegistry,
): ComponentPropertyError | undefined {
  const definition = instance.definition as Record<string, unknown>;
  for (const [atKey, bareKey] of ENVELOPE_PAIRS) {
    if (!Object.hasOwn(definition, bareKey)) continue;
    // A bare key the catalog declares is an ordinary property and may coexist with its @ form.
    if (catalogs.declaresComponentProperty(catalogId, instance.component, bareKey)) continue;
    // Deliberate deviation: the v1.0 transitional dual-read of legacy bare accessibility/checks is NOT
    // implemented. An undeclared bare key (with or without its @ form) is rejected as a reserved-key conflict.
    return {
      code: "INVALID_RESERVED_KEY",
      message: Object.hasOwn(definition, atKey)
        ? `Component "${instance.sourceComponentId}" carries both "${atKey}" and the undeclared "${bareKey}"`
        : `Component "${instance.sourceComponentId}" carries the undeclared bare "${bareKey}"; use "${atKey}"`,
      sourceComponentId: instance.sourceComponentId,
      key: bareKey,
    };
  }
  const declared = definition["@catalogId"];
  if (declared !== undefined && declared !== catalogId) {
    return {
      code: "UNSUPPORTED_FEATURE",
      message: `Component "${instance.sourceComponentId}" declares @catalogId "${String(declared)}" which differs from the surface catalog; multi-catalog components are not yet supported`,
      sourceComponentId: instance.sourceComponentId,
      feature: "@catalogId",
    };
  }
  return undefined;
}

function catalogFailure(cause: CatalogRegistryError): ComponentPropertyError {
  return {
    code: "CATALOG_PROPERTY_METADATA_FAILED",
    message: cause.message,
    cause,
  };
}

/** Resolves the @accessibility envelope; label and description are DynamicStrings and hidden is a DynamicBoolean. */
function resolveAccessibility(
  instance: ResolvedComponentInstance,
  hydrate: (original: JsonValue, valueKind: DynamicPropertyKind | "dynamicValue", location: readonly ComponentPropertyLocationSegment[]) => HydratedValue,
): ResolvedAccessibility | undefined {
  const source = instance.definition["@accessibility"];
  if (source === undefined || source === null || typeof source !== "object" || Array.isArray(source)) return undefined;
  const attributes = source as JsonObject;
  const base = (name: string): readonly ComponentPropertyLocationSegment[] => [
    { kind: "property", name: "@accessibility" },
    { kind: "property", name },
  ];
  const result: ResolvedAccessibility = {};
  for (const name of ["label", "description"] as const) {
    if (!Object.hasOwn(attributes, name)) continue;
    const value = hydrate(attributes[name]!, "dynamicString", base(name));
    if (typeof value === "string") result[name] = value;
  }
  if (typeof attributes.live === "string" && ACCESSIBILITY_LIVE.has(attributes.live)) {
    result.live = attributes.live as ResolvedAccessibility["live"];
  }
  if (Object.hasOwn(attributes, "hidden")) {
    const value = hydrate(attributes.hidden!, "dynamicBoolean", base("hidden"));
    if (typeof value === "boolean") result.hidden = value;
  }
  return result;
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
    scope?: AgentFunctionScope,
  ): ComponentPropertyResult {
    const envelope = checkEnvelope(instance, catalogId, this.catalogs);
    if (envelope !== undefined) return { ok: false, error: envelope };
    const structure = this.catalogs.getComponentStructure(
      catalogId,
      instance.component,
    );
    if (!structure.ok)
      return { ok: false, error: catalogFailure(structure.error) };
    const structuralMetadata = this.catalogs.getComponentStructureLocations(
      catalogId,
      instance.component,
    );
    if (!structuralMetadata.ok)
      return { ok: false, error: catalogFailure(structuralMetadata.error) };
    const metadata = this.catalogs.getDynamicValueLocations(
      catalogId,
      instance.component,
    );
    if (!metadata.ok)
      return { ok: false, error: catalogFailure(metadata.error) };
    const bindableMetadata = this.catalogs.getBindableValueLocations(
      catalogId,
      instance.component,
    );
    if (!bindableMetadata.ok)
      return { ok: false, error: catalogFailure(bindableMetadata.error) };

    const properties: ResolvedComponentProperties = {};
    const unresolved: UnresolvedProperty[] = [];
    const issues: ComponentPropertyIssue[] = [];

    for (const [property, original] of Object.entries(instance.definition)) {
      if (ENVELOPE_KEYS.has(property)) continue;
      properties[property] = cloneJson(original);
    }

    const hydrateValue = (
      original: JsonValue,
      valueKind: DynamicPropertyKind | "dynamicValue",
      location: readonly ComponentPropertyLocationSegment[],
    ): HydratedValue => {
      const property = location[0]?.kind === "property" ? location[0].name : "";
      let value: JsonValue | undefined;
      let functionOwned = false;
      if (isFunctionCall(original)) {
        const evaluated = this.functionEvaluator.evaluate(
          catalogId,
          original,
          dataContext,
          scope,
        );
        if (!evaluated.ok) {
          unresolved.push({
            property,
            reason: "FUNCTION_EVALUATION_FAILED",
            functionCall: cloneJson(original) as JsonObject,
            ...nestedLocation(location),
          });
          issues.push(
            functionError(
              instance.sourceComponentId,
              property,
              evaluated.error,
              location,
            ),
          );
          return undefined;
        }
        // A binding that waits on an agent call resolves to null until the call settles (spec: pending value is null).
        value = evaluated.awaiting === undefined ? evaluated.value : null;
        functionOwned = true;
      } else if (isDataBinding(original)) {
        const resolved = dataContext.resolveBinding(original);
        value = resolved.ok ? resolved.value : undefined;
      } else if (valueKind === "dynamicValue") {
        // A DynamicValue literal: @@ keys unescape to @; any other reserved key is a typed issue.
        const unescaped = unescapeLiteralDynamicValue(original);
        if (!unescaped.ok) {
          issues.push({
            code: "INVALID_RESERVED_KEY",
            sourceComponentId: instance.sourceComponentId,
            property,
            key: unescaped.error.key,
            path: unescaped.error.path,
            ...nestedLocation(location),
          });
          return undefined;
        }
        value = unescaped.value;
      } else {
        value = cloneJson(original);
      }

      // DynamicBoolean positions always receive a boolean (absent and null become false).
      if (valueKind === "dynamicBoolean") {
        return coerceDynamicBoolean(value);
      }
      if (value !== undefined && !compatible(valueKind, value)) {
        issues.push({
          code: "DYNAMIC_VALUE_TYPE_MISMATCH",
          sourceComponentId: instance.sourceComponentId,
          property,
          expected: valueKind,
          ...nestedLocation(location),
        });
        return value === null ? null : undefined;
      }
      return value === undefined
        ? undefined
        : functionOwned
          ? clonePlain(value)
          : cloneJson(value);
    };

    const apply = (
      schemaPath: readonly DynamicValueLocationSegment[],
      offset: number,
      original: JsonValue,
      target: HydratedValue,
      runtimePath: ComponentPropertyLocationSegment[],
      valueKind: DynamicPropertyKind | "dynamicValue",
    ): HydratedValue => {
      if (offset === schemaPath.length)
        return hydrateValue(original, valueKind, runtimePath);
      const segment = schemaPath[offset]!;
      if (segment.kind === "property") {
        if (
          original === null ||
          Array.isArray(original) ||
          typeof original !== "object" ||
          target === null ||
          Array.isArray(target) ||
          typeof target !== "object" ||
          !Object.hasOwn(original, segment.name)
        )
          return target;
        const originalChild = original[segment.name]!;
        const targetObject = target as { [key: string]: HydratedValue };
        targetObject[segment.name] = apply(
          schemaPath,
          offset + 1,
          originalChild,
          targetObject[segment.name],
          [...runtimePath, { kind: "property", name: segment.name }],
          valueKind,
        );
        return target;
      }
      if (!Array.isArray(original) || !Array.isArray(target)) return target;
      for (let index = 0; index < original.length; index += 1) {
        target[index] = apply(
          schemaPath,
          offset + 1,
          original[index]!,
          target[index],
          [...runtimePath, { kind: "arrayIndex", index }],
          valueKind,
        );
      }
      return target;
    };

    for (const location of metadata.value) {
      const first = location.path[0];
      if (
        first?.kind !== "property" ||
        !Object.hasOwn(instance.definition, first.name)
      )
        continue;
      properties[first.name] = apply(
        location.path,
        1,
        instance.definition[first.name]!,
        properties[first.name],
        [{ kind: "property", name: first.name }],
        location.valueKind,
      );
    }

    const applyBindable = (
      schemaPath: readonly DynamicValueLocationSegment[],
      offset: number,
      original: JsonValue,
      target: HydratedValue,
      runtimePath: ComponentPropertyLocationSegment[],
    ): HydratedValue => {
      if (offset === schemaPath.length) {
        if (!isDataBinding(original)) return cloneJson(original);
        const property =
          runtimePath[0]?.kind === "property" ? runtimePath[0].name : "";
        const resolved = dataContext.resolveBinding(original);
        if (!resolved.ok) {
          issues.push({
            code: "BINDABLE_VALUE_RESOLUTION_FAILED",
            sourceComponentId: instance.sourceComponentId,
            property,
            error: { ...resolved.error },
            location: runtimePath.map((segment) => ({ ...segment })),
            path: readablePath(runtimePath),
          });
          return undefined;
        }
        if (resolved.value === undefined) return undefined;
        if (
          !this.catalogs.validateBindableValue(
            catalogId,
            instance.component,
            { path: schemaPath },
            resolved.value,
          )
        ) {
          issues.push({
            code: "BINDABLE_VALUE_TYPE_MISMATCH",
            sourceComponentId: instance.sourceComponentId,
            property,
            location: runtimePath.map((segment) => ({ ...segment })),
            path: readablePath(runtimePath),
          });
          return resolved.value === null ? null : undefined;
        }
        return cloneJson(resolved.value);
      }
      const segment = schemaPath[offset]!;
      if (segment.kind === "property") {
        if (
          original === null ||
          Array.isArray(original) ||
          typeof original !== "object" ||
          target === null ||
          Array.isArray(target) ||
          typeof target !== "object" ||
          !Object.hasOwn(original, segment.name)
        )
          return target;
        const targetObject = target as { [key: string]: HydratedValue };
        targetObject[segment.name] = applyBindable(
          schemaPath,
          offset + 1,
          original[segment.name]!,
          targetObject[segment.name],
          [...runtimePath, { kind: "property", name: segment.name }],
        );
        return target;
      }
      if (!Array.isArray(original) || !Array.isArray(target)) return target;
      for (let index = 0; index < original.length; index += 1) {
        target[index] = applyBindable(
          schemaPath,
          offset + 1,
          original[index]!,
          target[index],
          [...runtimePath, { kind: "arrayIndex", index }],
        );
      }
      return target;
    };
    for (const location of bindableMetadata.value) {
      const first = location.path[0];
      if (
        first?.kind !== "property" ||
        !Object.hasOwn(instance.definition, first.name)
      )
        continue;
      properties[first.name] = applyBindable(
        location.path,
        1,
        instance.definition[first.name]!,
        properties[first.name],
        [{ kind: "property", name: first.name }],
      );
    }

    const removeStructural = (
      target: HydratedValue,
      path: readonly DynamicValueLocationSegment[],
      offset: number,
    ): void => {
      const segment = path[offset];
      if (segment === undefined) return;
      if (segment.kind === "property") {
        if (
          target === null ||
          Array.isArray(target) ||
          typeof target !== "object"
        )
          return;
        if (offset === path.length - 1) {
          delete target[segment.name];
          return;
        }
        if (Object.hasOwn(target, segment.name))
          removeStructural(target[segment.name], path, offset + 1);
        return;
      }
      if (!Array.isArray(target)) return;
      for (const item of target) removeStructural(item, path, offset + 1);
    };
    for (const location of structuralMetadata.value)
      removeStructural(properties, location.path, 0);

    const accessibility = resolveAccessibility(instance, hydrateValue);
    return { ok: true, value: { properties, unresolved, issues, ...(accessibility === undefined ? {} : { accessibility }) } };
  }

  resolveTree(
    surface: SurfaceSnapshot,
    instances: ComponentInstanceTreeInput,
  ): ComponentPropertyTreeResult {
    if (!instances.ready || instances.root === undefined) {
      return {
        ok: true,
        value: {
          ready: false,
          instanceIssues: clonePlain(instances.issues),
          issues: [],
        },
      };
    }

    const issues: ComponentPropertyIssue[] = [];
    const hydrate = (
      instance: ResolvedComponentInstance,
      context: DataContext,
    ): ComponentPropertyResult<HydratedComponentInstance> => {
      const own = this.resolve(instance, context, surface.catalogId, { surfaceId: surface.surfaceId, kind: "reactive" });
      if (!own.ok) return own;
      issues.push(...own.value.issues.map((issue) => ({ ...issue })));
      const relationships: HydratedInstanceRelationship[] = [];

      for (const relationship of instance.relationships) {
        if (relationship.kind === "single") {
          if (relationship.child === undefined) {
            relationships.push({
              kind: "single",
              property: relationship.property,
              location: relationship.location.map((segment) => ({
                ...segment,
              })),
            });
          } else {
            const child = hydrate(relationship.child, context);
            if (!child.ok) return child;
            relationships.push({
              kind: "single",
              property: relationship.property,
              location: relationship.location.map((segment) => ({
                ...segment,
              })),
              child: child.value,
            });
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
          relationships.push({
            kind: "list",
            property: relationship.property,
            location: relationship.location.map((segment) => ({ ...segment })),
            children,
          });
          continue;
        }

        const children: HydratedComponentInstance[] = [];
        for (const childInstance of relationship.children) {
          const index = childInstance.collectionIndex;
          const childContext =
            index === undefined
              ? {
                  ok: false as const,
                  error: {
                    code: "INVALID_COLLECTION_INDEX" as const,
                    index: Number.NaN,
                  },
                }
              : context.createCollectionItemContext(
                  relationship.collectionPath,
                  index,
                );
          if (!childContext.ok) {
            return {
              ok: false,
              error: {
                code: "DATA_CONTEXT_RECONSTRUCTION_FAILED",
                message:
                  "Could not reconstruct the component instance data scope",
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
          ...(instance.collectionIndex === undefined
            ? {}
            : { collectionIndex: instance.collectionIndex }),
          properties: own.value.properties,
          ...(own.value.accessibility === undefined ? {} : { accessibility: own.value.accessibility }),
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

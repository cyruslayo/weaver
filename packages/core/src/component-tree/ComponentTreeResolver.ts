import type { CatalogRegistry, CatalogRegistryError } from "../catalog/index.js";
import type { A2UIComponent, JsonObject, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type { ComponentTreeError } from "./errors.js";
import type {
  ComponentTreeIssue,
  ComponentTreeResult,
  ResolvedComponentNode,
  ResolvedRelationship,
} from "./types.js";

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson) as T;
  const clone: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) clone[key] = cloneJson(entry);
  return clone as T;
}

function resolverError(error: CatalogRegistryError): ComponentTreeError {
  return {
    code: error.code === "CATALOG_NOT_FOUND" ? "CATALOG_NOT_FOUND" : "COMPONENT_STRUCTURE_NOT_FOUND",
    message: error.message,
    catalogId: error.catalogId,
    ...(error.component === undefined ? {} : { component: error.component }),
    cause: { ...error, ...(error.issues === undefined ? {} : { issues: error.issues.map((issue) => ({ ...issue })) }) },
  };
}

function dynamicChildList(value: JsonValue): { path: string; componentId: string } | undefined {
  if (value === null || Array.isArray(value) || typeof value !== "object") return undefined;
  const object = value as JsonObject;
  return typeof object.path === "string" && typeof object.componentId === "string"
    ? { path: object.path, componentId: object.componentId }
    : undefined;
}

export class ComponentTreeResolver {
  constructor(private readonly catalogs: CatalogRegistry) {}

  resolve(surface: SurfaceSnapshot): ComponentTreeResult {
    return this.resolveFrom(surface, "root");
  }

  /** Resolves structure beginning at a trusted component ID. */
  resolveFrom(surface: SurfaceSnapshot, componentId: string): ComponentTreeResult {
    if (!this.catalogs.has(surface.catalogId)) {
      const missing = this.catalogs.getComponentStructure(surface.catalogId, componentId);
      if (!missing.ok) return { ok: false, error: resolverError(missing.error) };
    }

    const startingComponent = surface.components[componentId];
    if (startingComponent === undefined) {
      return { ok: true, value: { ready: false, issues: [] } };
    }

    const issues: ComponentTreeIssue[] = [];
    const resolveNode = (
      component: A2UIComponent,
      ancestry: readonly string[],
    ): ResolvedComponentNode | ComponentTreeError => {
      const structure = this.catalogs.getComponentStructure(surface.catalogId, component.component);
      if (!structure.ok) return resolverError(structure.error);

      const relationships: ResolvedRelationship[] = [];
      const path = [...ancestry, component.id];
      const resolveTarget = (
        property: string,
        targetId: string,
      ): ResolvedComponentNode | ComponentTreeError | undefined => {
        const target = surface.components[targetId];
        if (target === undefined) {
          issues.push({ code: "MISSING_COMPONENT_REFERENCE", sourceId: component.id, property, targetId });
          return undefined;
        }
        if (path.includes(targetId)) {
          issues.push({
            code: "CIRCULAR_COMPONENT_REFERENCE",
            sourceId: component.id,
            property,
            targetId,
            path: [...path, targetId],
          });
          return undefined;
        }
        return resolveNode(target, path);
      };

      for (const property of structure.value.singleChildFields) {
        const targetId = component[property];
        if (typeof targetId !== "string") continue;
        const node = resolveTarget(property, targetId);
        if (node !== undefined && "code" in node) return node;
        relationships.push({ kind: "single", property, targetId, ...(node === undefined ? {} : { node }) });
      }

      for (const property of structure.value.childListFields) {
        const value = component[property];
        if (Array.isArray(value)) {
          const targetIds = value.filter((entry): entry is string => typeof entry === "string");
          const nodes: ResolvedComponentNode[] = [];
          for (const targetId of targetIds) {
            const node = resolveTarget(property, targetId);
            if (node !== undefined && "code" in node) return node;
            if (node !== undefined) nodes.push(node);
          }
          relationships.push({ kind: "list", property, targetIds: [...targetIds], nodes });
          continue;
        }

        const template = dynamicChildList(value);
        if (template === undefined) continue;
        if (surface.components[template.componentId] === undefined) {
          issues.push({
            code: "MISSING_COMPONENT_REFERENCE",
            sourceId: component.id,
            property,
            targetId: template.componentId,
          });
        }
        relationships.push({ kind: "template", property, ...template });
      }

      return {
        id: component.id,
        component: component.component,
        definition: cloneJson(component),
        relationships,
      };
    };

    const root = resolveNode(startingComponent, []);
    if ("code" in root) return { ok: false, error: root };
    return { ok: true, value: { ready: true, root, issues } };
  }
}

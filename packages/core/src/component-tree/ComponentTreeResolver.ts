import type {
  CatalogRegistry, CatalogRegistryError, ComponentStructureLocation,
} from "../catalog/index.js";
import type { A2UIComponent, JsonObject, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type { ComponentTreeError } from "./errors.js";
import type {
  ComponentRelationshipLocationSegment, ComponentTreeIssue, ComponentTreeResult,
  ResolvedComponentNode, ResolvedRelationship,
} from "./types.js";

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson) as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)])) as T;
}

function resolverError(error: CatalogRegistryError): ComponentTreeError {
  return {
    code: error.code === "CATALOG_NOT_FOUND" ? "CATALOG_NOT_FOUND" : "COMPONENT_STRUCTURE_NOT_FOUND",
    message: error.message, catalogId: error.catalogId,
    ...(error.component === undefined ? {} : { component: error.component }),
    cause: { ...error, ...(error.issues === undefined ? {} : { issues: error.issues.map((issue) => ({ ...issue })) }) },
  };
}

function dynamicChildList(value: JsonValue): { path: string; componentId: string } | undefined {
  if (value === null || Array.isArray(value) || typeof value !== "object") return undefined;
  const object = value as JsonObject;
  return typeof object.path === "string" && typeof object.componentId === "string"
    ? { path: object.path, componentId: object.componentId } : undefined;
}

function pointer(location: readonly ComponentRelationshipLocationSegment[]): string {
  return "/" + location.map((segment) => segment.kind === "property"
    ? segment.name.replaceAll("~", "~0").replaceAll("/", "~1") : String(segment.index)).join("/");
}

function runtimeValues(
  value: JsonValue,
  metadata: ComponentStructureLocation,
): { value: JsonValue; location: ComponentRelationshipLocationSegment[]; property: string }[] {
  const found: { value: JsonValue; location: ComponentRelationshipLocationSegment[]; property: string }[] = [];
  const visit = (current: JsonValue, offset: number, location: ComponentRelationshipLocationSegment[]): void => {
    if (offset === metadata.path.length) {
      const leaf = location.at(-1);
      if (leaf?.kind === "property") found.push({ value: current, location, property: leaf.name });
      return;
    }
    const segment = metadata.path[offset]!;
    if (segment.kind === "property") {
      if (current !== null && !Array.isArray(current) && typeof current === "object" && Object.hasOwn(current, segment.name)) {
        visit(current[segment.name]!, offset + 1, [...location, { kind: "property", name: segment.name }]);
      }
      return;
    }
    if (!Array.isArray(current)) return;
    for (let index = 0; index < current.length; index += 1) {
      visit(current[index]!, offset + 1, [...location, { kind: "arrayIndex", index }]);
    }
  };
  visit(value, 0, []);
  return found;
}

export class ComponentTreeResolver {
  constructor(private readonly catalogs: CatalogRegistry) {}
  resolve(surface: SurfaceSnapshot): ComponentTreeResult { return this.resolveFrom(surface, "root"); }

  resolveFrom(surface: SurfaceSnapshot, componentId: string): ComponentTreeResult {
    if (!this.catalogs.has(surface.catalogId)) {
      const missing = this.catalogs.getComponentStructureLocations(surface.catalogId, componentId);
      if (!missing.ok) return { ok: false, error: resolverError(missing.error) };
    }
    const startingComponent = surface.components[componentId];
    if (startingComponent === undefined) return { ok: true, value: { ready: false, issues: [] } };

    const issues: ComponentTreeIssue[] = [];
    const resolveNode = (component: A2UIComponent, ancestry: readonly string[]): ResolvedComponentNode | ComponentTreeError => {
      const metadata = this.catalogs.getComponentStructureLocations(surface.catalogId, component.component);
      if (!metadata.ok) return resolverError(metadata.error);
      const relationships: ResolvedRelationship[] = [];
      const ancestryPath = [...ancestry, component.id];
      const resolveTarget = (property: string, location: ComponentRelationshipLocationSegment[], targetId: string) => {
        const issueLocation = { location: location.map((segment) => ({ ...segment })), propertyPath: pointer(location) };
        const target = surface.components[targetId];
        if (target === undefined) {
          issues.push({ code: "MISSING_COMPONENT_REFERENCE", sourceId: component.id, property, targetId, ...issueLocation });
          return undefined;
        }
        if (ancestryPath.includes(targetId)) {
          issues.push({ code: "CIRCULAR_COMPONENT_REFERENCE", sourceId: component.id, property, targetId,
            path: [...ancestryPath, targetId], ...issueLocation });
          return undefined;
        }
        return resolveNode(target, ancestryPath);
      };

      for (const structural of metadata.value) {
        for (const runtime of runtimeValues(component, structural)) {
          const { property, location, value } = runtime;
          if (structural.kind === "single") {
            if (typeof value !== "string") continue;
            const node = resolveTarget(property, location, value);
            if (node !== undefined && "code" in node) return node;
            relationships.push({ kind: "single", property, location, targetId: value, ...(node === undefined ? {} : { node }) });
            continue;
          }
          if (Array.isArray(value)) {
            const targetIds = value.filter((entry): entry is string => typeof entry === "string");
            const nodes: ResolvedComponentNode[] = [];
            for (const targetId of targetIds) {
              const node = resolveTarget(property, location, targetId);
              if (node !== undefined && "code" in node) return node;
              if (node !== undefined) nodes.push(node);
            }
            relationships.push({ kind: "list", property, location, targetIds, nodes });
            continue;
          }
          const template = dynamicChildList(value);
          if (template === undefined) continue;
          if (surface.components[template.componentId] === undefined) {
            issues.push({ code: "MISSING_COMPONENT_REFERENCE", sourceId: component.id, property,
              targetId: template.componentId, location: location.map((segment) => ({ ...segment })), propertyPath: pointer(location) });
          }
          relationships.push({ kind: "template", property, location, ...template });
        }
      }
      return { id: component.id, component: component.component, definition: cloneJson(component), relationships };
    };

    const root = resolveNode(startingComponent, []);
    if ("code" in root) return { ok: false, error: root };
    return { ok: true, value: { ready: true, root, issues } };
  }
}

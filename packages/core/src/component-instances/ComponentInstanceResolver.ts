import { ComponentTreeResolver } from "../component-tree/index.js";
import type {
  ComponentTreeIssue,
  ResolvedComponentNode,
} from "../component-tree/index.js";
import { DataContext } from "../data-context/index.js";
import type { DataContextError } from "../data-context/index.js";
import type { JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type { ComponentInstanceError } from "./errors.js";
import type {
  ComponentInstanceIssue,
  ComponentInstanceResult,
  ResolvedComponentInstance,
  ResolvedInstanceRelationship,
} from "./types.js";

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson) as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)])) as T;
}

function failure(cause: ComponentInstanceError["cause"]): ComponentInstanceResult {
  return {
    ok: false,
    error: { code: "COMPONENT_TREE_RESOLUTION_FAILED", message: cause.message, cause },
  };
}

function cloneStructuralIssue(issue: ComponentTreeIssue): ComponentTreeIssue {
  return issue.code === "CIRCULAR_COMPONENT_REFERENCE"
    ? { ...issue, path: [...issue.path] }
    : { ...issue };
}

function isTemplateReferenceIssue(node: ResolvedComponentNode, issue: ComponentTreeIssue): boolean {
  if (issue.code !== "MISSING_COMPONENT_REFERENCE") return false;
  const visit = (current: ResolvedComponentNode): boolean => {
    if (current.id === issue.sourceId && current.relationships.some((relationship) =>
      relationship.kind === "template" && relationship.property === issue.property &&
      relationship.componentId === issue.targetId)) return true;
    return current.relationships.some((relationship) => {
      if (relationship.kind === "single") return relationship.node === undefined ? false : visit(relationship.node);
      if (relationship.kind === "list") return relationship.nodes.some(visit);
      return false;
    });
  };
  return visit(node);
}

/** Pure snapshot-to-instance-tree composition. It owns no runtime state. */
export class ComponentInstanceResolver {
  constructor(private readonly componentTrees: ComponentTreeResolver) {}

  resolve(surface: SurfaceSnapshot): ComponentInstanceResult {
    const tree = this.componentTrees.resolve(surface);
    if (!tree.ok) return failure(tree.error);
    if (!tree.value.ready || tree.value.root === undefined) {
      return { ok: true, value: { ready: false, issues: [] } };
    }

    const issues: ComponentInstanceIssue[] = [];
    const issueKeys = new Set<string>();
    const addIssue = (issue: ComponentInstanceIssue) => {
      const key = JSON.stringify(issue);
      if (!issueKeys.has(key)) {
        issueKeys.add(key);
        issues.push(issue);
      }
    };
    const addStructuralIssues = (root: ResolvedComponentNode, structural: readonly ComponentTreeIssue[]) => {
      for (const issue of structural) {
        // Template absence has a more precise instance-layer issue, emitted during expansion.
        if (!isTemplateReferenceIssue(root, issue)) addIssue({ code: "STRUCTURAL_ISSUE", issue: cloneStructuralIssue(issue) });
      }
    };
    addStructuralIssues(tree.value.root, tree.value.issues);

    const active = new Set<string>();
    const instantiate = (
      node: ResolvedComponentNode,
      context: DataContext,
      incomingProperty: string,
    ): ResolvedComponentInstance | undefined => {
      const identity = `${node.id}\u0000${context.scopePath}`;
      if (active.has(identity)) {
        addIssue({
          code: "CIRCULAR_TEMPLATE_EXPANSION",
          sourceComponentId: node.id,
          scopePath: context.scopePath,
          property: incomingProperty,
        });
        return undefined;
      }

      active.add(identity);
      const relationships: ResolvedInstanceRelationship[] = [];
      for (const relationship of node.relationships) {
        if (relationship.kind === "single") {
          const child = relationship.node === undefined
            ? undefined
            : instantiate(relationship.node, context, relationship.property);
          relationships.push({ kind: "single", property: relationship.property, ...(child === undefined ? {} : { child }) });
          continue;
        }
        if (relationship.kind === "list") {
          relationships.push({
            kind: "list",
            property: relationship.property,
            children: relationship.nodes.flatMap((childNode) => {
              const child = instantiate(childNode, context, relationship.property);
              return child === undefined ? [] : [child];
            }),
          });
          continue;
        }

        const children: ResolvedComponentInstance[] = [];
        relationships.push({
          kind: "template",
          property: relationship.property,
          collectionPath: relationship.path,
          children,
        });

        const collection = context.get(relationship.path);
        if (!collection.ok) {
          addIssue({
            code: "INVALID_TEMPLATE_COLLECTION_PATH",
            sourceComponentId: node.id,
            property: relationship.property,
            collectionPath: relationship.path,
            cause: { ...collection.error },
          });
          continue;
        }
        const resolvedPath = context.resolvePath(relationship.path);
        if (!resolvedPath.ok) continue; // get() already proved the path valid.
        if (collection.value === undefined) {
          const cause: DataContextError = { code: "COLLECTION_NOT_FOUND", path: resolvedPath.value };
          addIssue({
            code: "TEMPLATE_COLLECTION_NOT_FOUND", sourceComponentId: node.id,
            property: relationship.property, collectionPath: relationship.path,
            resolvedPath: resolvedPath.value, cause,
          });
          continue;
        }
        if (!Array.isArray(collection.value)) {
          const cause: DataContextError = { code: "COLLECTION_NOT_ARRAY", path: resolvedPath.value };
          addIssue({
            code: "TEMPLATE_COLLECTION_NOT_ARRAY", sourceComponentId: node.id,
            property: relationship.property, collectionPath: relationship.path,
            resolvedPath: resolvedPath.value, cause,
          });
          continue;
        }
        if (surface.components[relationship.componentId] === undefined) {
          addIssue({
            code: "MISSING_TEMPLATE_COMPONENT", sourceComponentId: node.id,
            property: relationship.property, templateComponentId: relationship.componentId,
          });
          continue;
        }

        const subtree = this.componentTrees.resolveFrom(surface, relationship.componentId);
        if (!subtree.ok) {
          active.delete(identity);
          throw subtree.error;
        }
        if (!subtree.value.ready || subtree.value.root === undefined) continue;
        addStructuralIssues(subtree.value.root, subtree.value.issues);
        for (let index = 0; index < collection.value.length; index += 1) {
          const childContext = context.createCollectionItemContext(relationship.path, index);
          if (!childContext.ok) continue; // The same immutable snapshot was validated above.
          const child = instantiate(subtree.value.root, childContext.value, relationship.property);
          if (child !== undefined) children.push(child);
        }
      }

      active.delete(identity);
      return {
        sourceComponentId: node.id,
        component: node.component,
        scopePath: context.scopePath,
        ...(context.collectionIndex === undefined ? {} : { collectionIndex: context.collectionIndex }),
        definition: cloneJson(node.definition),
        relationships,
      };
    };

    try {
      const root = instantiate(tree.value.root, DataContext.root(surface.dataModel), "root");
      return { ok: true, value: { ready: true, ...(root === undefined ? {} : { root }), issues } };
    } catch (error) {
      return failure(error as ComponentInstanceError["cause"]);
    }
  }
}

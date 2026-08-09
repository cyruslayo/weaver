import type { A2UIComponent } from "../protocol/index.js";

export type ComponentRelationshipLocationSegment =
  | { kind: "property"; name: string }
  | { kind: "arrayIndex"; index: number };

export interface ResolvedComponentNode {
  id: string;
  component: string;
  definition: A2UIComponent;
  relationships: ResolvedRelationship[];
}

interface RelationshipLocation {
  property: string;
  location: ComponentRelationshipLocationSegment[];
}

export type ResolvedRelationship =
  | (RelationshipLocation & {
      kind: "single";
      targetId: string;
      node?: ResolvedComponentNode;
    })
  | (RelationshipLocation & {
      kind: "list";
      targetIds: string[];
      nodes: ResolvedComponentNode[];
    })
  | (RelationshipLocation & {
      kind: "template";
      path: string;
      componentId: string;
    });

interface StructuralIssueLocation {
  location: ComponentRelationshipLocationSegment[];
  /** JSON Pointer representation of location. */
  propertyPath: string;
}

export type ComponentTreeIssue =
  | (StructuralIssueLocation & {
      code: "MISSING_COMPONENT_REFERENCE";
      sourceId: string;
      property: string;
      targetId: string;
    })
  | (StructuralIssueLocation & {
      code: "CIRCULAR_COMPONENT_REFERENCE";
      sourceId: string;
      property: string;
      targetId: string;
      path: string[];
    });

export interface ComponentTreeSnapshot {
  ready: boolean;
  root?: ResolvedComponentNode;
  issues: ComponentTreeIssue[];
}

export type ComponentTreeResult =
  | { ok: true; value: ComponentTreeSnapshot }
  | { ok: false; error: import("./errors.js").ComponentTreeError };

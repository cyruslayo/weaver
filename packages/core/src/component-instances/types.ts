import type { ComponentRelationshipLocationSegment, ComponentTreeIssue } from "../component-tree/index.js";
import type { DataContextError } from "../data-context/index.js";
import type { A2UIComponent } from "../protocol/index.js";

/** Logical identity is the positional pair sourceComponentId + scopePath. */
export interface ResolvedComponentInstance {
  sourceComponentId: string;
  component: string;
  scopePath: string;
  collectionIndex?: number;
  definition: A2UIComponent;
  relationships: ResolvedInstanceRelationship[];
}

export type ResolvedInstanceRelationship =
  | { kind: "single"; property: string; location: ComponentRelationshipLocationSegment[]; child?: ResolvedComponentInstance }
  | { kind: "list"; property: string; location: ComponentRelationshipLocationSegment[]; children: ResolvedComponentInstance[] }
  | {
      kind: "template";
      property: string;
      location: ComponentRelationshipLocationSegment[];
      collectionPath: string;
      children: ResolvedComponentInstance[];
    };

export type ComponentInstanceIssue =
  | { code: "STRUCTURAL_ISSUE"; issue: ComponentTreeIssue }
  | {
      code: "TEMPLATE_COLLECTION_NOT_FOUND" | "TEMPLATE_COLLECTION_NOT_ARRAY";
      sourceComponentId: string;
      property: string;
      collectionPath: string;
      resolvedPath: string;
      cause: DataContextError;
    }
  | {
      code: "INVALID_TEMPLATE_COLLECTION_PATH";
      sourceComponentId: string;
      property: string;
      collectionPath: string;
      cause: DataContextError;
    }
  | {
      code: "MISSING_TEMPLATE_COMPONENT";
      sourceComponentId: string;
      property: string;
      templateComponentId: string;
    }
  | {
      code: "CIRCULAR_TEMPLATE_EXPANSION";
      sourceComponentId: string;
      scopePath: string;
      property: string;
    };

export interface ComponentInstanceSnapshot {
  ready: boolean;
  root?: ResolvedComponentInstance;
  issues: ComponentInstanceIssue[];
}

export type ComponentInstanceResult =
  | { ok: true; value: ComponentInstanceSnapshot }
  | { ok: false; error: import("./errors.js").ComponentInstanceError };

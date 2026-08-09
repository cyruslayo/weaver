import type { A2UIComponent } from "../protocol/index.js";

export interface ResolvedComponentNode {
  id: string;
  component: string;
  definition: A2UIComponent;
  relationships: ResolvedRelationship[];
}

export type ResolvedRelationship =
  | {
      kind: "single";
      property: string;
      targetId: string;
      node?: ResolvedComponentNode;
    }
  | {
      kind: "list";
      property: string;
      targetIds: string[];
      nodes: ResolvedComponentNode[];
    }
  | {
      kind: "template";
      property: string;
      path: string;
      componentId: string;
    };

export type ComponentTreeIssue =
  | {
      code: "MISSING_COMPONENT_REFERENCE";
      sourceId: string;
      property: string;
      targetId: string;
    }
  | {
      code: "CIRCULAR_COMPONENT_REFERENCE";
      sourceId: string;
      property: string;
      targetId: string;
      path: string[];
    };

export interface ComponentTreeSnapshot {
  ready: boolean;
  root?: ResolvedComponentNode;
  issues: ComponentTreeIssue[];
}

export type ComponentTreeResult =
  | { ok: true; value: ComponentTreeSnapshot }
  | { ok: false; error: import("./errors.js").ComponentTreeError };

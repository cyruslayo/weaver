import type { DynamicPropertyKind } from "../catalog/index.js";
import type { ComponentInstanceIssue, ComponentInstanceSnapshot } from "../component-instances/index.js";
import type { ComponentRelationshipLocationSegment } from "../component-tree/index.js";
import type { DataContextError } from "../data-context/index.js";
import type { FunctionEvaluationError } from "../functions/index.js";
import type { JsonObject, JsonPrimitive } from "../protocol/index.js";

/** Renderer-facing derived data; unlike protocol JSON it preserves progressive missing values. */
export type HydratedValue =
  | JsonPrimitive
  | undefined
  | HydratedValue[]
  | { [key: string]: HydratedValue };

export type ResolvedComponentProperties = Record<string, HydratedValue>;

export type ComponentPropertyLocationSegment = ComponentRelationshipLocationSegment;

export interface UnresolvedProperty {
  property: string;
  reason: "FUNCTION_EVALUATION_FAILED";
  functionCall: JsonObject;
  location?: ComponentPropertyLocationSegment[];
  path?: string;
}

export interface HydratedComponentInstance {
  sourceComponentId: string;
  component: string;
  scopePath: string;
  collectionIndex?: number;
  properties: ResolvedComponentProperties;
  relationships: HydratedInstanceRelationship[];
  unresolved: UnresolvedProperty[];
}

export type HydratedInstanceRelationship =
  | { kind: "single"; property: string; location: ComponentRelationshipLocationSegment[]; child?: HydratedComponentInstance }
  | { kind: "list"; property: string; location: ComponentRelationshipLocationSegment[]; children: HydratedComponentInstance[] }
  | { kind: "template"; property: string; location: ComponentRelationshipLocationSegment[]; collectionPath: string; children: HydratedComponentInstance[] };

export type ComponentPropertyIssue =
  | {
      code: "DYNAMIC_VALUE_TYPE_MISMATCH";
      sourceComponentId: string;
      property: string;
      expected: DynamicPropertyKind;
      location?: ComponentPropertyLocationSegment[];
      path?: string;
    }
  | {
      code: "FUNCTION_EVALUATION_FAILED";
      sourceComponentId: string;
      property: string;
      error: FunctionEvaluationError;
      location?: ComponentPropertyLocationSegment[];
      path?: string;
    };

export interface ResolvedInstanceProperties {
  properties: ResolvedComponentProperties;
  unresolved: UnresolvedProperty[];
  issues: ComponentPropertyIssue[];
}

export interface HydratedComponentTree {
  ready: boolean;
  root?: HydratedComponentInstance;
  instanceIssues: ComponentInstanceIssue[];
  issues: ComponentPropertyIssue[];
}

export type ComponentPropertyResult<T = ResolvedInstanceProperties> =
  | { ok: true; value: T }
  | { ok: false; error: import("./errors.js").ComponentPropertyError };

export type ComponentPropertyTreeResult = ComponentPropertyResult<HydratedComponentTree>;

/** Input accepted by resolveTree; successful instance results may pass their value directly. */
export type ComponentInstanceTreeInput = ComponentInstanceSnapshot;

export interface ContextReconstructionFailure {
  sourceComponentId: string;
  scopePath: string;
  cause: DataContextError;
}

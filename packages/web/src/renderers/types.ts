import type {
  ComponentCheckSnapshot,
  ComponentRelationshipLocationSegment,
  HydratedComponentInstance,
  HydratedValue,
  JsonValue,
  WeaverActionResult,
  WeaverInputResult,
} from "@weaver/core";

export type WebInteractionError =
  | { code: "STALE_RENDER_INTERACTION" }
  | { code: "SERVER_EVENT_HANDOFF_FAILED" };

export type WebInputInteractionResult =
  | WeaverInputResult
  | { ok: false; error: Extract<WebInteractionError, { code: "STALE_RENDER_INTERACTION" }> };

export type WebActionInteractionResult =
  | WeaverActionResult
  | { ok: false; error: WebInteractionError };

export type WebLocalStateResult =
  | { ok: true }
  | { ok: false; error: { code: "STALE_RENDER_INTERACTION" | "INVALID_LOCAL_STATE_VALUE" } };

export interface WebComponentInteractions {
  writeInput(property: string, value: JsonValue): WebInputInteractionResult;
  dispatchAction(actionProperty: string): WebActionInteractionResult;
  /** Reads defensively owned, ephemeral state for this component instance in this mount. */
  getLocalState<T extends JsonValue>(key: string, fallback: T): T;
  /** Replaces ephemeral state and synchronously refreshes this mount without mutating Core. */
  setLocalState<T extends JsonValue>(key: string, value: T): WebLocalStateResult;
  /** Registers a component-local native control identity for mount-local focus continuity. */
  registerControl(element: Element, localKey: string): void;
}

export type WebRenderedRelationship =
  | {
      kind: "single";
      property: string;
      location: readonly ComponentRelationshipLocationSegment[];
      child?: Node;
      childComponent?: string;
      childProperties?: Readonly<Record<string, HydratedValue>>;
    }
  | {
      kind: "list" | "template";
      property: string;
      location: readonly ComponentRelationshipLocationSegment[];
      children: readonly Node[];
      childComponents?: readonly string[];
      childProperties?: readonly Readonly<Record<string, HydratedValue>>[];
    };

export interface WebComponentRenderInput {
  document: Document;
  catalogId: string;
  instance: HydratedComponentInstance;
  properties: Readonly<Record<string, HydratedValue>>;
  relationships: readonly WebRenderedRelationship[];
  checks?: ComponentCheckSnapshot;
  interactions: WebComponentInteractions;
}

export type WebComponentRenderer = (input: WebComponentRenderInput) => Node;

export interface RendererRegistration {
  catalogId: string;
  component: string;
  render: WebComponentRenderer;
}

export interface RendererMetadata {
  catalogId: string;
  component: string;
}

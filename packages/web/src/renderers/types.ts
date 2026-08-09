import type { ComponentCheckSnapshot, HydratedComponentInstance, JsonValue } from "@weaver/core";

export type WebRenderedRelationship =
  | { kind: "single"; property: string; child?: Node }
  | { kind: "list"; property: string; children: readonly Node[] }
  | { kind: "template"; property: string; children: readonly Node[] };

export interface WebComponentRenderInput {
  document: Document;
  catalogId: string;
  instance: HydratedComponentInstance;
  properties: Readonly<Record<string, JsonValue | undefined>>;
  relationships: readonly WebRenderedRelationship[];
  checks?: ComponentCheckSnapshot;
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

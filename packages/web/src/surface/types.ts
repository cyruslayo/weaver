import type { ActionTransportMetadata, A2UIClientActionMessage, WeaverRuntime } from "@weaver/core";
import type { RendererRegistry } from "../renderers/index.js";
import type { WebRenderError } from "./errors.js";

export interface WebServerEventHandoff {
  message: A2UIClientActionMessage;
  metadata?: ActionTransportMetadata;
}

export interface WebSurfaceRendererConfig {
  runtime: WeaverRuntime;
  renderers: RendererRegistry;
  /** Optional transport-neutral notification. Missing handlers do not fail dispatch. */
  onServerEvent?: (event: WebServerEventHandoff) => void;
}

export interface WebSurfaceMountOptions {
  surfaceId: string;
  target: Element;
  onError?: (error: WebRenderError) => void;
}

export type WebSurfaceRenderResult =
  | { ok: true; value: { ready: boolean } }
  | { ok: false; error: WebRenderError };

export interface WebSurfaceMount {
  refresh(): WebSurfaceRenderResult;
  unmount(): void;
  getLastResult(): WebSurfaceRenderResult;
}

export type WebSurfaceMountResult =
  | { ok: true; value: WebSurfaceMount }
  | { ok: false; error: WebRenderError };

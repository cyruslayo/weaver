import type { WeaverRuntime } from "@weaver/core";
import type { RendererRegistry } from "../renderers/index.js";
import type { WebRenderError } from "./errors.js";

export interface WebSurfaceRendererConfig {
  runtime: WeaverRuntime;
  renderers: RendererRegistry;
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

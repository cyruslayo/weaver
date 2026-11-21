import type { ActionTransportMetadata, A2UIRendererActionMessage, WeaverActionResult, WeaverRuntime } from "@cylayo/weaver-core";
import type { RendererRegistry } from "../renderers/index.js";
import type { WebRenderError } from "./errors.js";

export interface WebServerEventHandoff {
  message: A2UIRendererActionMessage;
  metadata?: ActionTransportMetadata;
}

/** A successful action result whose kind is agentFunctionCalls. Pass it to `transport.sendActionCalls`. */
export type WebAgentFunctionCallsHandoff = Extract<WeaverActionResult, { ok: true }>;

export interface WebSurfaceAttributionInput {
  surfaceId: string;
  catalogId: string;
}

export interface WebVerifiedSurfaceAttribution {
  displayName: string;
  iconUrl?: string;
}

/** Trusted host boundary that supplies the verified identity shown in surface attribution chrome. */
export type WebSurfaceAttributionProvider = (
  input: Readonly<WebSurfaceAttributionInput>,
) => WebVerifiedSurfaceAttribution | undefined;

export interface WebSurfaceRendererConfig {
  runtime: WeaverRuntime;
  renderers: RendererRegistry;
  /** Optional trusted host provider. No attribution is rendered when absent. */
  attributionProvider?: WebSurfaceAttributionProvider;
  /** Optional transport-neutral notification. Missing handlers do not fail dispatch. */
  onServerEvent?: (event: WebServerEventHandoff) => void;
  /**
   * Optional handoff for a user action that waits on agent calls. The host sends
   * them with transport.sendActionCalls. Without this handler the calls stay
   * pending until the host cancels them.
   */
  onAgentFunctionCalls?: (result: WebAgentFunctionCallsHandoff) => void;
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

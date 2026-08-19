import type {
  CatalogRegistration,
  WeaverRuntime,
  WeaverRuntimeConfig,
  WeaverRuntimeConfigurationError,
} from "@weaver/core";
import type { BasicCatalogRendererRegistrationOptions } from "../basic/index.js";
import type {
  RendererRegistration,
  RendererRegistryConfigurationError,
} from "../renderers/index.js";
import type {
  WebServerEventHandoff,
  WebSurfaceAttributionProvider,
  WebSurfaceMountOptions,
  WebSurfaceMountResult,
} from "../surface/index.js";

export interface BasicWebRuntimeRenderingOptions {
  attributionProvider?: WebSurfaceAttributionProvider;
  onServerEvent?: (event: WebServerEventHandoff) => void;
}

export interface BasicWebRuntimeConfig {
  additionalCatalogs?: readonly CatalogRegistration[];
  runtime?: Omit<WeaverRuntimeConfig, "catalogs">;
  basic?: Omit<BasicCatalogRendererRegistrationOptions, "catalogId">;
  additionalRenderers?: readonly RendererRegistration[];
  rendering?: BasicWebRuntimeRenderingOptions;
}

export interface BasicWebRuntime {
  readonly catalogId: string;
  readonly runtime: WeaverRuntime;
  mount(options: WebSurfaceMountOptions): WebSurfaceMountResult;
}

export type BasicWebRuntimeCreationError =
  | WeaverRuntimeConfigurationError
  | {
      code: "RENDERER_CONFIGURATION_FAILED";
      rendererError: RendererRegistryConfigurationError;
    };

export type BasicWebRuntimeCreationResult =
  | { ok: true; value: BasicWebRuntime }
  | { ok: false; error: BasicWebRuntimeCreationError };

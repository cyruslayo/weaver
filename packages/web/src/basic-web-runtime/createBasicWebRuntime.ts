import {
  A2UI_V091_BASIC_CATALOG_ID,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
} from "@weaver/core";
import {
  createBasicCatalogRendererRegistrations,
  createBasicCatalogThemeAdapter,
} from "../basic/index.js";
import {
  RendererRegistry,
  RendererRegistryConfigurationError,
} from "../renderers/index.js";
import { WebSurfaceRenderer } from "../surface/index.js";
import type {
  BasicWebRuntime,
  BasicWebRuntimeConfig,
  BasicWebRuntimeCreationResult,
} from "./types.js";

/** Creates the canonical, framework-free Basic Catalog browser runtime. */
export function createBasicWebRuntime(
  config: BasicWebRuntimeConfig = {},
): BasicWebRuntimeCreationResult {
  const catalogId = A2UI_V091_BASIC_CATALOG_ID;
  const runtimeCreated = createWeaverRuntime({
    ...config.runtime,
    catalogs: [createBasicCatalogV091Registration(), ...(config.additionalCatalogs ?? [])],
  });
  if (!runtimeCreated.ok) return runtimeCreated;

  const basic = config.basic;
  const registrations = [
    ...createBasicCatalogRendererRegistrations({
      catalogId,
      ...(basic?.resourcePolicy === undefined ? {} : { resourcePolicy: basic.resourcePolicy }),
      ...(basic?.iconResolver === undefined ? {} : { iconResolver: basic.iconResolver }),
      ...(basic?.regexMatcher === undefined ? {} : { regexMatcher: basic.regexMatcher }),
      ...(basic?.dateTimeInputLocalValueResolver === undefined
        ? {}
        : { dateTimeInputLocalValueResolver: basic.dateTimeInputLocalValueResolver }),
    }),
    ...(config.additionalRenderers ?? []),
  ];
  let renderers: RendererRegistry;
  try {
    renderers = new RendererRegistry(registrations);
  } catch (error) {
    if (error instanceof RendererRegistryConfigurationError) {
      return { ok: false, error: { code: "RENDERER_CONFIGURATION_FAILED", rendererError: error } };
    }
    throw error;
  }

  const surface = new WebSurfaceRenderer({
    runtime: runtimeCreated.value,
    renderers,
    themeAdapter: createBasicCatalogThemeAdapter({ catalogId }),
    ...(config.rendering?.attributionProvider === undefined ? {} : { attributionProvider: config.rendering.attributionProvider }),
    ...(config.rendering?.onServerEvent === undefined ? {} : { onServerEvent: config.rendering.onServerEvent }),
  });

  const runtime = runtimeCreated.value;
  const facade: BasicWebRuntime = {
    catalogId,
    runtime,
    mount: (options) => surface.mount(options),
  };
  return { ok: true, value: facade };
}

import type { RendererRegistration } from "@cylayo/weaver-web";
import { createBarChartRegistration } from "./barChart.js";
import { createCookbookLayoutRenderers } from "./layout.js";

/**
 * The one place that lists the cookbook catalog's trusted renderers.
 * Pass the result as `additionalRenderers` to `createBasicWebRuntime`, next to
 * `additionalCatalogs: [cookbookCatalog]`. Each new cookbook component adds one entry here.
 */
export function createCookbookRendererRegistrations(): RendererRegistration[] {
  return [
    ...createCookbookLayoutRenderers(),
    createBarChartRegistration(),
  ];
}

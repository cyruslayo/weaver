import { createBasicCatalogRendererRegistrations, type RendererRegistration } from "@cylayo/weaver-web";
import { COOKBOOK_CATALOG_ID } from "../custom-catalog/catalog.js";

/** The layout primitives the cookbook catalog declares. */
const LAYOUT_COMPONENTS: ReadonlySet<string> = new Set(["Column", "Text", "Card"]);

/**
 * Column, Text, and Card under the cookbook catalog id.
 *
 * These reuse the trusted Basic renderers, so no render code is copied. The
 * Basic registration is built for the cookbook catalog id, and only the three
 * components the cookbook catalog declares are kept.
 */
export function createCookbookLayoutRenderers(catalogId: string = COOKBOOK_CATALOG_ID): RendererRegistration[] {
  return createBasicCatalogRendererRegistrations({ catalogId }).filter((registration) =>
    LAYOUT_COMPONENTS.has(registration.component),
  );
}

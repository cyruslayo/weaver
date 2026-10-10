import {
  createBasicCatalogRendererRegistrations,
  type RendererRegistration,
} from "@cylayo/weaver-web";
import { COOKBOOK_CATALOG_ID } from "./catalog.js";
import { dataTableRegistration } from "./dataTableRenderer.js";

/** The layout primitives the cookbook catalog declares. Their Basic renderers are reused, not copied. */
const COOKBOOK_LAYOUT_COMPONENTS: readonly string[] = ["Text", "Column", "Card"];

/**
 * Basic's trusted Text, Column and Card renderers, keyed to the cookbook
 * catalog id. Basic keys its renderers to the Basic catalog id, so a cookbook
 * surface needs them again under its own id.
 */
const cookbookLayoutRenderers: RendererRegistration[] = createBasicCatalogRendererRegistrations({
  catalogId: COOKBOOK_CATALOG_ID,
}).filter((registration) => COOKBOOK_LAYOUT_COMPONENTS.includes(registration.component));

/**
 * Every trusted renderer for the cookbook catalog. Pass it to
 * `createBasicWebRuntime({ additionalRenderers })` together with
 * `additionalCatalogs: [cookbookCatalog]`. Add one line per cookbook component.
 */
export const cookbookCatalogRendererRegistrations: readonly RendererRegistration[] = [
  ...cookbookLayoutRenderers,
  dataTableRegistration,
];

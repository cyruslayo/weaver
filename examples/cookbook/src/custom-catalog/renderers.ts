import {
  createBasicCatalogRendererRegistrations,
  type RendererRegistration,
} from "@cylayo/weaver-web";
import { COOKBOOK_CATALOG_ID } from "./catalog.js";
import { createBarChartRegistration } from "./barChart.js";
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
 * The ONE registration point for every trusted renderer of the cookbook catalog.
 * Pass it to `createBasicWebRuntime({ additionalRenderers })` together with
 * `additionalCatalogs: [cookbookCatalog]`. RendererRegistry throws on duplicate
 * registrations, so each component appears here exactly once. Add one line per
 * new cookbook component, and never register a component in another file.
 */
export const cookbookCatalogRendererRegistrations: readonly RendererRegistration[] = [
  ...cookbookLayoutRenderers,
  dataTableRegistration,
  createBarChartRegistration(),
];

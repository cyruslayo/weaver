import type { RendererRegistration } from "../renderers/index.js";
import {
  renderButton,
  renderCard,
  renderColumn,
  renderDivider,
  renderList,
  renderRow,
  renderText,
} from "./renderers.js";

export interface BasicCatalogRendererRegistrationOptions {
  catalogId: string;
}

/** Creates the trusted, foundation-only A2UI Basic Catalog renderer allowlist. */
export function createBasicCatalogRendererRegistrations(
  options: BasicCatalogRendererRegistrationOptions,
): RendererRegistration[] {
  return [
    { catalogId: options.catalogId, component: "Text", render: renderText },
    { catalogId: options.catalogId, component: "Divider", render: renderDivider },
    { catalogId: options.catalogId, component: "Row", render: renderRow },
    { catalogId: options.catalogId, component: "Column", render: renderColumn },
    { catalogId: options.catalogId, component: "List", render: renderList },
    { catalogId: options.catalogId, component: "Card", render: renderCard },
    { catalogId: options.catalogId, component: "Button", render: renderButton },
  ];
}

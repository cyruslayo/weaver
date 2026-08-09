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
import { createBasicInputRenderers } from "./inputs.js";

export interface BasicCatalogRendererRegistrationOptions {
  catalogId: string;
}

/** Creates the trusted, foundation-only A2UI Basic Catalog renderer allowlist. */
export function createBasicCatalogRendererRegistrations(
  options: BasicCatalogRendererRegistrationOptions,
): RendererRegistration[] {
  const inputs = createBasicInputRenderers();
  return [
    { catalogId: options.catalogId, component: "Text", render: renderText },
    { catalogId: options.catalogId, component: "Divider", render: renderDivider },
    { catalogId: options.catalogId, component: "Row", render: renderRow },
    { catalogId: options.catalogId, component: "Column", render: renderColumn },
    { catalogId: options.catalogId, component: "List", render: renderList },
    { catalogId: options.catalogId, component: "Card", render: renderCard },
    { catalogId: options.catalogId, component: "Button", render: renderButton },
    { catalogId: options.catalogId, component: "TextField", render: inputs.TextField },
    { catalogId: options.catalogId, component: "CheckBox", render: inputs.CheckBox },
    { catalogId: options.catalogId, component: "Slider", render: inputs.Slider },
    { catalogId: options.catalogId, component: "ChoicePicker", render: inputs.ChoicePicker },
    { catalogId: options.catalogId, component: "DateTimeInput", render: inputs.DateTimeInput },
  ];
}

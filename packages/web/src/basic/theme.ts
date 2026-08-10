import type { WebSurfaceThemeAdapter } from "../surface/index.js";

export interface BasicCatalogThemeAdapterOptions {
  catalogId: string;
}

/** Creates the opt-in, allowlisted Basic Catalog surface-theme translation. */
export function createBasicCatalogThemeAdapter(
  options: BasicCatalogThemeAdapterOptions,
): WebSurfaceThemeAdapter {
  return (input) => {
    if (input.catalogId !== options.catalogId) return { customProperties: {} };
    const primaryColor = input.theme?.primaryColor;
    const customProperties: Record<string, string> = {};
    if (typeof primaryColor === "string" && /^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
      customProperties["--a2ui-color-primary"] = primaryColor;
    }
    return { customProperties };
  };
}

import type { A2UIRendererCapabilities } from "./types.js";

export function buildA2UIRendererCapabilities(input: {
  supportedCatalogIds: readonly string[];
}): A2UIRendererCapabilities {
  return { "1.0": { supportedCatalogIds: [...input.supportedCatalogIds] } };
}

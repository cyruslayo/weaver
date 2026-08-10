import type { A2UIClientCapabilities } from "./types.js";

export function buildA2UIClientCapabilities(input: {
  supportedCatalogIds: readonly string[];
}): A2UIClientCapabilities {
  return { "v0.9": { supportedCatalogIds: [...input.supportedCatalogIds] } };
}

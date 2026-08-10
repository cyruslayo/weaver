import type { FunctionRegistration } from "@weaver/core";
import { createOpenUrlImplementation } from "./openUrl.js";
import type { BasicCatalogBrowserFunctionOptions } from "./types.js";

/** Creates explicitly opt-in browser action functions for the Basic Catalog. */
export function createBasicCatalogBrowserFunctionImplementations(
  options: BasicCatalogBrowserFunctionOptions,
): FunctionRegistration[] {
  if (typeof options.catalogId !== "string") throw new TypeError("catalogId is required");
  let baseUrl: string | undefined;
  if (options.baseUrl !== undefined) {
    try {
      baseUrl = new URL(options.baseUrl).href;
    } catch {
      throw new TypeError("baseUrl must be an absolute valid URL");
    }
  }
  return [{
    catalogId: options.catalogId,
    name: "openUrl",
    effect: "action",
    implementation: createOpenUrlImplementation(options, baseUrl),
  }];
}

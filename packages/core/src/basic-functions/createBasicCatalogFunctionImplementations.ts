import type { FunctionRegistration } from "../functions/index.js";
import { createFormatDate } from "./formatDate.js";
import { formatString } from "./formatString.js";
import { createFormattingFunctions } from "./formatting.js";
import { and, not, or } from "./logic.js";
import type { BasicCatalogFunctionOptions } from "./types.js";
import { email, length, numeric, required } from "./validation.js";

/** Creates an opt-in, catalog-scoped set of trusted pure Basic Catalog functions. */
export function createBasicCatalogFunctionImplementations(
  options: BasicCatalogFunctionOptions,
): FunctionRegistration[] {
  if (typeof options.catalogId !== "string") throw new TypeError("catalogId is required");
  const formatting = createFormattingFunctions(options);
  const implementations = {
    required,
    length,
    numeric,
    email,
    formatString,
    formatNumber: formatting.formatNumber,
    formatCurrency: formatting.formatCurrency,
    formatDate: createFormatDate(options),
    pluralize: formatting.pluralize,
    and,
    or,
    not,
  } as const;
  return Object.entries(implementations).map(([name, implementation]) => ({
    catalogId: options.catalogId,
    name,
    implementation,
  }));
}

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
  const regex = options.regexMatcher === undefined
    ? {}
    : { regex: (args: Readonly<Record<string, unknown>>) => {
      if (typeof args.value !== "string" || typeof args.pattern !== "string") {
        throw new TypeError("regex requires string value and pattern arguments");
      }
      const result = options.regexMatcher!({ value: args.value, pattern: args.pattern });
      if (typeof result !== "boolean") throw new TypeError("regexMatcher must return a boolean");
      return result;
    } };
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
    ...regex,
  } as const;
  return Object.entries(implementations).map(([name, implementation]) => ({
    catalogId: options.catalogId,
    name,
    effect: "pure",
    implementation,
  }));
}

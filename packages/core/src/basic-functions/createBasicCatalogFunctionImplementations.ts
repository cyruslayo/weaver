import type { FunctionRegistration } from "../functions/index.js";
import { createFormatDate } from "./formatDate.js";
import { formatString } from "./formatString.js";
import { createFormattingFunctions } from "./formatting.js";
import { and, not, or } from "./logic.js";
import { checkA2UIRegexPattern, codePointLength, REGEX_MAX_VALUE_CODE_POINTS } from "./regexDialect.js";
import type { BasicCatalogFunctionOptions } from "./types.js";
import { email, length, numeric, required } from "./validation.js";

/**
 * Creates an opt-in, catalog-scoped set of trusted pure Basic Catalog functions.
 *
 * regex is registered only when the host supplies a matcher. Core validates the
 * A2UI regex dialect and its safety rules first; the host matcher then runs only
 * on a vetted pattern.
 */
export function createBasicCatalogFunctionImplementations(options: BasicCatalogFunctionOptions): FunctionRegistration[] {
  if (typeof options.catalogId !== "string") throw new TypeError("catalogId is required");
  const formatting = createFormattingFunctions(options);
  const matcher = options.regexMatcher;
  const regex = matcher === undefined ? {} : {
    regex: (args: Readonly<Record<string, unknown>>, context: { propagateFunctionFailure(error: import("../functions/index.js").FunctionEvaluationError): never }) => {
      if (typeof args.value !== "string" || typeof args.pattern !== "string") {
        throw new TypeError("regex requires string value and pattern arguments");
      }
      // Oversized values never match and report no error, so they short-circuit before pattern checks.
      if (codePointLength(args.value) > REGEX_MAX_VALUE_CODE_POINTS) return { valid: false };
      const dialect = checkA2UIRegexPattern(args.pattern);
      if (!dialect.ok) {
        context.propagateFunctionFailure({
          code: "EXPRESSION_ERROR",
          message: dialect.message,
          catalogId: options.catalogId,
          functionName: "regex",
        });
      }
      const matched = matcher({ value: args.value, pattern: args.pattern });
      if (typeof matched !== "boolean") throw new TypeError("regexMatcher must return a boolean");
      return { valid: matched };
    },
  };
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

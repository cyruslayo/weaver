import type { BasicCatalogFunctionOptions } from "./types.js";

function finiteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected a finite number");
  return value;
}

function numberOptions(args: Readonly<Record<string, unknown>>): Intl.NumberFormatOptions {
  const options: Intl.NumberFormatOptions = { useGrouping: args.grouping === undefined ? true : args.grouping as boolean };
  if (typeof options.useGrouping !== "boolean") throw new Error("grouping must be a boolean");
  if (args.decimals !== undefined) {
    if (typeof args.decimals !== "number" || !Number.isFinite(args.decimals) || !Number.isInteger(args.decimals) || args.decimals < 0) {
      throw new Error("decimals must be a non-negative integer");
    }
    options.minimumFractionDigits = args.decimals;
    options.maximumFractionDigits = args.decimals;
  }
  return options;
}

export function createFormattingFunctions(options: BasicCatalogFunctionOptions) {
  const locale = options.locale;
  return {
    formatNumber(args: Readonly<Record<string, unknown>>): string {
      return new Intl.NumberFormat(locale, numberOptions(args)).format(finiteNumber(args.value));
    },
    formatCurrency(args: Readonly<Record<string, unknown>>): string {
      if (typeof args.currency !== "string") throw new Error("currency must be a string");
      return new Intl.NumberFormat(locale, {
        ...numberOptions(args),
        style: "currency",
        currency: args.currency,
      }).format(finiteNumber(args.value));
    },
    pluralize(args: Readonly<Record<string, unknown>>): string {
      const category = new Intl.PluralRules(locale).select(finiteNumber(args.value));
      const selected = args[category] ?? args.other;
      if (typeof selected !== "string") throw new Error("plural form must be a string");
      return selected;
    },
  };
}

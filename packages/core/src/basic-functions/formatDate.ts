import type { BasicCatalogFunctionOptions } from "./types.js";

const TOKENS = ["yyyy", "MMMM", "EEEE", "MMM", "yy", "MM", "dd", "hh", "HH", "mm", "ss", "M", "d", "E", "h", "H", "a"] as const;
type Token = typeof TOKENS[number];

function part(date: Date, locale: BasicCatalogFunctionOptions["locale"], timeZone: string | undefined, options: Intl.DateTimeFormatOptions, type: Intl.DateTimeFormatPartTypes): string {
  return new Intl.DateTimeFormat(locale, { ...options, ...(timeZone === undefined ? {} : { timeZone }) })
    .formatToParts(date).find((entry) => entry.type === type)?.value ?? "";
}

function renderToken(token: Token, date: Date, options: BasicCatalogFunctionOptions): string {
  const base = { locale: options.locale, timeZone: options.timeZone };
  switch (token) {
    case "yy": return part(date, base.locale, base.timeZone, { year: "2-digit" }, "year");
    case "yyyy": return part(date, base.locale, base.timeZone, { year: "numeric" }, "year");
    case "M": return part(date, base.locale, base.timeZone, { month: "numeric" }, "month");
    case "MM": return part(date, base.locale, base.timeZone, { month: "2-digit" }, "month");
    case "MMM": return part(date, base.locale, base.timeZone, { month: "short" }, "month");
    case "MMMM": return part(date, base.locale, base.timeZone, { month: "long" }, "month");
    case "d": return part(date, base.locale, base.timeZone, { day: "numeric" }, "day");
    case "dd": return part(date, base.locale, base.timeZone, { day: "2-digit" }, "day");
    case "E": return part(date, base.locale, base.timeZone, { weekday: "short" }, "weekday");
    case "EEEE": return part(date, base.locale, base.timeZone, { weekday: "long" }, "weekday");
    case "h": return part(date, base.locale, base.timeZone, { hour: "numeric", hourCycle: "h12" }, "hour");
    case "hh": return part(date, base.locale, base.timeZone, { hour: "2-digit", hourCycle: "h12" }, "hour");
    case "H": return part(date, base.locale, base.timeZone, { hour: "numeric", hourCycle: "h23" }, "hour");
    case "HH": return part(date, base.locale, base.timeZone, { hour: "2-digit", hourCycle: "h23" }, "hour");
    case "mm": return part(date, base.locale, base.timeZone, { minute: "2-digit" }, "minute").padStart(2, "0");
    case "ss": return part(date, base.locale, base.timeZone, { second: "2-digit" }, "second").padStart(2, "0");
    case "a": return part(date, base.locale, base.timeZone, { hour: "numeric", hourCycle: "h12" }, "dayPeriod");
  }
}

function formatPattern(pattern: string, date: Date, options: BasicCatalogFunctionOptions): string {
  let output = "";
  for (let index = 0; index < pattern.length;) {
    if (pattern[index] === "'") {
      index++;
      let closed = false;
      while (index < pattern.length) {
        if (pattern[index] === "'" && pattern[index + 1] === "'") { output += "'"; index += 2; continue; }
        if (pattern[index] === "'") { index++; closed = true; break; }
        output += pattern[index++];
      }
      if (!closed) throw new Error("Unterminated date literal");
      continue;
    }
    const token = TOKENS.find((candidate) => pattern.startsWith(candidate, index));
    if (token !== undefined) { output += renderToken(token, date, options); index += token.length; continue; }
    const character = pattern[index]!;
    if (/[A-Za-z]/.test(character)) throw new Error(`Unsupported date token: ${character}`);
    output += character;
    index++;
  }
  return output;
}

export function createFormatDate(options: BasicCatalogFunctionOptions) {
  return (args: Readonly<Record<string, unknown>>): string => {
    if ((typeof args.value !== "string" && typeof args.value !== "number") ||
      (typeof args.value === "number" && !Number.isFinite(args.value)) || typeof args.format !== "string") {
      throw new Error("Invalid date arguments");
    }
    const date = new Date(args.value);
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid date");
    return formatPattern(args.format, date, options);
  };
}

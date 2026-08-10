function booleanValues(args: Readonly<Record<string, unknown>>): boolean[] {
  if (!Array.isArray(args.values) || args.values.some((value) => typeof value !== "boolean")) {
    throw new Error("values must contain only booleans");
  }
  return args.values;
}

export function and(args: Readonly<Record<string, unknown>>): boolean {
  return booleanValues(args).every((value) => value);
}

export function or(args: Readonly<Record<string, unknown>>): boolean {
  return booleanValues(args).some((value) => value);
}

export function not(args: Readonly<Record<string, unknown>>): boolean {
  if (typeof args.value !== "boolean") throw new Error("value must be a boolean");
  return !args.value;
}

export interface DataPathBinding {
  path: string;
}

/** Strictly recognizes the schema-aligned, single-property path binding. */
export function isDataPathBinding(value: unknown): value is DataPathBinding {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "path" && typeof (value as { path?: unknown }).path === "string";
}

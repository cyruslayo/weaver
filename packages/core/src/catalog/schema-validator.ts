import { Validator, type OutputUnit, type Schema } from "@cfworker/json-schema";

import type { JsonObject } from "../protocol/index.js";

export interface SchemaValidationIssue {
  path: string;
  message: string;
  keyword: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaValidationIssue[];
}

const DRAFT = "2020-12" as const;
const TYPES = new Set(["null", "boolean", "object", "array", "number", "string", "integer"]);

function pointer(location: string): string {
  if (location === "#" || location === "") return "/";
  return location.startsWith("#/") ? location.slice(1) : location;
}

function requiredProperty(error: OutputUnit): string | undefined {
  return error.keyword === "required" ? /required property "([^"]+)"/.exec(error.error)?.[1] : undefined;
}

function escapePointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function issue(error: OutputUnit): SchemaValidationIssue {
  const base = pointer(error.instanceLocation);
  const missing = requiredProperty(error);
  return {
    path: missing === undefined ? base : `${base === "/" ? "" : base}/${escapePointerSegment(missing)}`,
    message: error.error || "Validation failed",
    keyword: error.keyword,
  };
}

/** Private interpreting-validator boundary. It never compiles schema data as JavaScript. */
export class SchemaValidator {
  readonly #validator: Validator;

  constructor(schema: JsonObject) {
    this.#validator = new Validator(schema as Schema, DRAFT, false);
  }

  validate(value: unknown): SchemaValidationResult {
    const result = this.#validator.validate(value);
    const errors = result.errors.filter((error) =>
      !(["properties", "items"].includes(error.keyword) && result.errors.some((candidate) =>
        candidate !== error && candidate.instanceLocation.startsWith(`${error.instanceLocation}/`)
      ))
    );
    errors.sort((left, right) => right.instanceLocation.length - left.instanceLocation.length);
    return { valid: result.valid, issues: errors.map(issue) };
  }
}

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Checks the draft-2020-12 schema shapes Core accepts before resolving the complete catalog graph. */
export function isValidSchema(schema: JsonObject): boolean {
  const visit = (value: unknown): boolean => {
    if (typeof value === "boolean") return true;
    if (!object(value)) return false;
    const type = value.type;
    if (type !== undefined && !(typeof type === "string" ? TYPES.has(type) : Array.isArray(type) && type.length > 0 && type.every((entry) => typeof entry === "string" && TYPES.has(entry)))) return false;
    for (const key of ["required"] as const) {
      if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every((entry) => typeof entry === "string"))) return false;
    }
    for (const key of ["oneOf", "anyOf", "allOf"] as const) {
      if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every(visit))) return false;
    }
    if (value.items !== undefined && !visit(value.items)) return false;
    if (value.not !== undefined && !visit(value.not)) return false;
    if (value.additionalProperties !== undefined && typeof value.additionalProperties !== "boolean" && !visit(value.additionalProperties)) return false;
    for (const key of ["properties", "$defs"] as const) {
      if (value[key] !== undefined && (!object(value[key]) || !Object.values(value[key]).every(visit))) return false;
    }
    if (value.pattern !== undefined) {
      if (typeof value.pattern !== "string") return false;
      try { new RegExp(value.pattern, "u"); } catch { return false; }
    }
    for (const key of ["minimum", "maximum"] as const) {
      if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) return false;
    }
    for (const key of ["minItems", "maxItems", "minProperties", "maxProperties"] as const) {
      if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isInteger(value[key]) || value[key] < 0)) return false;
    }
    return true;
  };
  return visit(schema);
}

function resolvesPointer(root: unknown, fragment: string): boolean {
  if (fragment === "" || fragment === "#") return true;
  if (!fragment.startsWith("#/")) return false;
  let current: unknown = root;
  for (const encoded of fragment.slice(2).split("/")) {
    const segment = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!object(current) || !(segment in current)) return false;
    current = current[segment];
  }
  return true;
}

/** Verifies references in the complete, related catalog document before it is retained. */
export function referencesResolve(schema: JsonObject): boolean {
  const resources = new Map<string, JsonObject>();
  const collect = (value: unknown): void => {
    if (!object(value)) {
      if (Array.isArray(value)) for (const entry of value) collect(entry);
      return;
    }
    if (typeof value.$id === "string") resources.set(value.$id, value);
    for (const child of Object.values(value)) collect(child);
  };
  collect(schema);
  const visit = (value: unknown, resource: JsonObject): boolean => {
    if (Array.isArray(value)) return value.every((entry) => visit(entry, resource));
    if (!object(value)) return true;
    const current = typeof value.$id === "string" ? value : resource;
    if (typeof value.$ref === "string") {
      const hash = value.$ref.indexOf("#");
      const document = hash < 0 ? value.$ref : value.$ref.slice(0, hash);
      const fragment = hash < 0 ? "" : value.$ref.slice(hash);
      const target = document === "" ? current : resources.get(document) ?? [...resources].find(([id]) => id.endsWith(document))?.[1];
      if (target === undefined || !resolvesPointer(target, fragment)) return false;
    }
    return Object.values(value).every((child) => visit(child, current));
  };
  return visit(schema, schema);
}

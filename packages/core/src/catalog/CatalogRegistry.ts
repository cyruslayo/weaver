import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import type { A2UIComponent, JsonObject, JsonValue } from "../protocol/index.js";
import type { CatalogRegistryError } from "./errors.js";
import { A2UI_CATALOG_SCHEMA } from "./schema.js";
import type {
  CatalogComponentValidationResult,
  CatalogRegistration,
  CatalogRegistryResult,
  CatalogSnapshot,
  CatalogValidationIssue,
} from "./types.js";

interface RegisteredCatalog {
  schema: JsonObject;
  validators: ReadonlyMap<string, ValidateFunction>;
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as T;
  const result: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) result[key] = cloneJson(entry);
  return result as T;
}

function error(code: CatalogRegistryError["code"], catalogId: string, message: string): CatalogRegistryError {
  return { code, catalogId, message };
}

function normalizeErrors(errors: ErrorObject[] | null | undefined): CatalogValidationIssue[] {
  return (errors ?? []).map(({ instancePath, message, keyword }) => ({
    path: instancePath || "/",
    message: message ?? "Validation failed",
    keyword,
  }));
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

export class CatalogRegistry {
  readonly #ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  readonly #validateCatalogShape = this.#ajv.compile(A2UI_CATALOG_SCHEMA);
  readonly #catalogs = new Map<string, RegisteredCatalog>();
  #registrationSequence = 0;

  register(registration: CatalogRegistration): CatalogRegistryResult<CatalogSnapshot> {
    const { catalogId } = registration;
    if (this.#catalogs.has(catalogId)) {
      return { ok: false, error: error("CATALOG_ALREADY_REGISTERED", catalogId, "Catalog is already registered") };
    }

    let schema: JsonObject;
    try {
      schema = cloneJson(registration.schema);
    } catch {
      return { ok: false, error: error("INVALID_CATALOG_SCHEMA", catalogId, "Catalog schema must be JSON data") };
    }

    if (!this.#validateCatalogShape(schema) || schema.catalogId !== catalogId) {
      const issues = normalizeErrors(this.#validateCatalogShape.errors);
      if (schema.catalogId !== catalogId) {
        issues.push({ path: "/catalogId", message: "Must match the registration catalogId", keyword: "const" });
      }
      return {
        ok: false,
        error: { ...error("INVALID_CATALOG_SCHEMA", catalogId, "Catalog schema is invalid"), issues },
      };
    }

    const components = schema.components as JsonObject;
    const validators = new Map<string, ValidateFunction>();
    try {
      for (const [componentName, componentSchema] of Object.entries(components)) {
        if (componentSchema === null || Array.isArray(componentSchema) || typeof componentSchema !== "object") {
          throw new Error("invalid component schema");
        }
        if (!this.#ajv.validateSchema(componentSchema)) throw new Error("invalid component schema");
        const compilationSchema = cloneJson(schema);
        compilationSchema.$id = `urn:weaver:catalog:${this.#registrationSequence}:${encodeURIComponent(componentName)}`;
        compilationSchema.$ref = `#/components/${escapeJsonPointer(componentName)}`;
        validators.set(componentName, this.#ajv.compile(compilationSchema));
      }
    } catch {
      return { ok: false, error: error("INVALID_CATALOG_SCHEMA", catalogId, "Catalog component schemas could not be compiled") };
    }

    this.#registrationSequence += 1;
    this.#catalogs.set(catalogId, { schema, validators });
    return { ok: true, value: { catalogId, schema: cloneJson(schema) } };
  }

  has(catalogId: string): boolean {
    return this.#catalogs.has(catalogId);
  }

  get(catalogId: string): CatalogSnapshot | undefined {
    const catalog = this.#catalogs.get(catalogId);
    return catalog === undefined ? undefined : { catalogId, schema: cloneJson(catalog.schema) };
  }

  list(): CatalogSnapshot[] {
    return [...this.#catalogs].map(([catalogId, catalog]) => ({ catalogId, schema: cloneJson(catalog.schema) }));
  }

  getSupportedCatalogIds(): string[] {
    return [...this.#catalogs.keys()];
  }

  validateComponent(catalogId: string, component: A2UIComponent): CatalogComponentValidationResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return { ok: false, error: error("CATALOG_NOT_FOUND", catalogId, "Catalog is not registered") };
    }

    const validator = catalog.validators.get(component.component);
    if (validator === undefined) {
      return {
        ok: false,
        error: {
          ...error("COMPONENT_NOT_ALLOWED", catalogId, "Component type is not allowed by the catalog"),
          componentId: component.id,
          component: component.component,
        },
      };
    }

    const componentId = component.id;
    const componentName = component.component;
    if (!validator(component)) {
      return {
        ok: false,
        error: {
          ...error("COMPONENT_VALIDATION_FAILED", catalogId, "Component does not satisfy the catalog schema"),
          componentId,
          component: componentName,
          issues: normalizeErrors(validator.errors),
        },
      };
    }
    return { ok: true, value: component };
  }
}

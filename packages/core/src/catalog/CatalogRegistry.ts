import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import type { A2UIComponent, JsonObject, JsonValue } from "../protocol/index.js";
import type { CatalogRegistryError } from "./errors.js";
import { A2UI_CATALOG_SCHEMA } from "./schema.js";
import type {
  CatalogComponentStructureResult,
  CatalogComponentValidationResult,
  CatalogDynamicPropertiesResult,
  CatalogRegistration,
  ComponentStructureDefinition,
  DynamicPropertyDefinition,
  DynamicPropertyKind,
  CatalogRegistryResult,
  CatalogSnapshot,
  CatalogThemeValidationResult,
  CatalogValidationIssue,
} from "./types.js";

interface RegisteredCatalog {
  schema: JsonObject;
  validators: ReadonlyMap<string, ValidateFunction>;
  structures: ReadonlyMap<string, ComponentStructureDefinition>;
  dynamicProperties: ReadonlyMap<string, readonly DynamicPropertyDefinition[]>;
  themeValidator: ValidateFunction;
}

const COMPONENT_ID_REF = "common_types.json#/$defs/ComponentId";
const CHILD_LIST_REF = "common_types.json#/$defs/ChildList";
const DYNAMIC_PROPERTY_REFS: Readonly<Record<string, DynamicPropertyKind>> = {
  "common_types.json#/$defs/DynamicString": "dynamicString",
  "common_types.json#/$defs/DynamicNumber": "dynamicNumber",
  "common_types.json#/$defs/DynamicBoolean": "dynamicBoolean",
  "common_types.json#/$defs/DynamicStringList": "dynamicStringList",
};

function discoverStructure(componentSchema: JsonObject): ComponentStructureDefinition {
  const structure: ComponentStructureDefinition = { singleChildFields: [], childListFields: [] };
  const properties = componentSchema.properties;
  if (properties === null || Array.isArray(properties) || typeof properties !== "object") return structure;

  for (const [property, propertySchema] of Object.entries(properties)) {
    if (propertySchema === null || Array.isArray(propertySchema) || typeof propertySchema !== "object") continue;
    if (propertySchema.$ref === COMPONENT_ID_REF) structure.singleChildFields.push(property);
    if (propertySchema.$ref === CHILD_LIST_REF) structure.childListFields.push(property);
  }
  return structure;
}

function discoverDynamicProperties(componentSchema: JsonObject): DynamicPropertyDefinition[] {
  const definitions: DynamicPropertyDefinition[] = [];
  const properties = componentSchema.properties;
  if (properties === null || Array.isArray(properties) || typeof properties !== "object") return definitions;
  for (const [property, propertySchema] of Object.entries(properties)) {
    if (propertySchema === null || Array.isArray(propertySchema) || typeof propertySchema !== "object") continue;
    const valueKind = typeof propertySchema.$ref === "string" ? DYNAMIC_PROPERTY_REFS[propertySchema.$ref] : undefined;
    if (valueKind !== undefined) definitions.push({ property, valueKind });
  }
  return definitions;
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

    const themeSchema = (schema.$defs as JsonObject | undefined)?.theme;
    if (themeSchema === undefined) {
      return { ok: false, error: error("THEME_SCHEMA_NOT_FOUND", catalogId, "Catalog does not define $defs.theme") };
    }
    if (themeSchema === null || Array.isArray(themeSchema) || typeof themeSchema !== "object") {
      return { ok: false, error: error("INVALID_CATALOG_SCHEMA", catalogId, "Catalog theme schema is invalid") };
    }

    const components = schema.components as JsonObject;
    const validators = new Map<string, ValidateFunction>();
    const structures = new Map<string, ComponentStructureDefinition>();
    const dynamicProperties = new Map<string, readonly DynamicPropertyDefinition[]>();
    let themeValidator: ValidateFunction;
    try {
      for (const [componentName, componentSchema] of Object.entries(components)) {
        if (componentSchema === null || Array.isArray(componentSchema) || typeof componentSchema !== "object") {
          throw new Error("invalid component schema");
        }
        if (!this.#ajv.validateSchema(componentSchema)) throw new Error("invalid component schema");
        structures.set(componentName, discoverStructure(componentSchema));
        dynamicProperties.set(componentName, discoverDynamicProperties(componentSchema));
        const compilationSchema = cloneJson(schema);
        compilationSchema.$id = `https://weaver.invalid/catalog/${this.#registrationSequence}/${encodeURIComponent(componentName)}/catalog.json`;
        compilationSchema.$ref = `#/components/${escapeJsonPointer(componentName)}`;
        validators.set(componentName, this.#ajv.compile(compilationSchema));
      }
      const themeCompilationSchema = cloneJson(schema);
      themeCompilationSchema.$id = `https://weaver.invalid/catalog/${this.#registrationSequence}/theme/catalog.json`;
      themeCompilationSchema.$ref = "#/$defs/theme";
      themeValidator = this.#ajv.compile(themeCompilationSchema);
    } catch {
      return { ok: false, error: error("INVALID_CATALOG_SCHEMA", catalogId, "Catalog schemas could not be compiled") };
    }

    this.#registrationSequence += 1;
    this.#catalogs.set(catalogId, { schema, validators, structures, dynamicProperties, themeValidator });
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

  getComponentStructure(catalogId: string, componentName: string): CatalogComponentStructureResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return { ok: false, error: error("CATALOG_NOT_FOUND", catalogId, "Catalog is not registered") };
    }
    const structure = catalog.structures.get(componentName);
    if (structure === undefined) {
      return {
        ok: false,
        error: {
          ...error("COMPONENT_STRUCTURE_NOT_FOUND", catalogId, "Component structural metadata is not available"),
          component: componentName,
        },
      };
    }
    return {
      ok: true,
      value: {
        singleChildFields: [...structure.singleChildFields],
        childListFields: [...structure.childListFields],
      },
    };
  }

  getDynamicProperties(catalogId: string, componentName: string): CatalogDynamicPropertiesResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return { ok: false, error: error("CATALOG_NOT_FOUND", catalogId, "Catalog is not registered") };
    }
    const definitions = catalog.dynamicProperties.get(componentName);
    if (definitions === undefined) {
      return {
        ok: false,
        error: {
          ...error("COMPONENT_STRUCTURE_NOT_FOUND", catalogId, "Component property metadata is not available"),
          component: componentName,
        },
      };
    }
    return { ok: true, value: definitions.map((definition) => ({ ...definition })) };
  }

  validateTheme(catalogId: string, theme: JsonObject): CatalogThemeValidationResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return { ok: false, error: error("CATALOG_NOT_FOUND", catalogId, "Catalog is not registered") };
    }
    if (!catalog.themeValidator(theme)) {
      return {
        ok: false,
        error: {
          ...error("THEME_VALIDATION_FAILED", catalogId, "Theme does not satisfy the catalog schema"),
          issues: normalizeErrors(catalog.themeValidator.errors),
        },
      };
    }
    return { ok: true, value: theme };
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

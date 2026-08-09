import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import type { A2UIComponent, JsonObject, JsonValue } from "../protocol/index.js";
import type { CatalogRegistryError } from "./errors.js";
import { A2UI_CATALOG_SCHEMA } from "./schema.js";
import type {
  CatalogActionPropertiesResult,
  CatalogComponentStructureLocationsResult,
  CatalogComponentStructureResult,
  CatalogComponentValidationResult,
  CatalogDynamicPropertiesResult,
  CatalogDynamicValueLocationsResult,
  CatalogFunctionArgumentDefinition,
  CatalogFunctionDefinition,
  CatalogFunctionDefinitionResult,
  CatalogFunctionReturnType,
  CatalogFunctionValidationResult,
  CatalogRegistration,
  ComponentStructureDefinition,
  ComponentStructureLocation,
  ComponentStructureLocationSegment,
  DynamicPropertyDefinition,
  DynamicPropertyKind,
  DynamicValueLocation,
  DynamicValueLocationSegment,
  CatalogRegistryResult,
  CatalogSnapshot,
  CatalogThemeValidationResult,
  CatalogValidationIssue,
} from "./types.js";

interface RegisteredCatalog {
  schema: JsonObject;
  validators: ReadonlyMap<string, ValidateFunction>;
  functionValidators: ReadonlyMap<string, ValidateFunction>;
  functionDefinitions: ReadonlyMap<string, CatalogFunctionDefinition>;
  structures: ReadonlyMap<string, ComponentStructureDefinition>;
  structureLocations: ReadonlyMap<string, readonly ComponentStructureLocation[]>;
  dynamicProperties: ReadonlyMap<string, readonly DynamicPropertyDefinition[]>;
  dynamicValueLocations: ReadonlyMap<string, readonly DynamicValueLocation[]>;
  actionProperties: ReadonlyMap<string, readonly string[]>;
  checkableComponents: ReadonlySet<string>;
  themeValidator: ValidateFunction;
}

const COMPONENT_ID_REF = "common_types.json#/$defs/ComponentId";
const CHILD_LIST_REF = "common_types.json#/$defs/ChildList";
const CHECKABLE_REF = "common_types.json#/$defs/Checkable";
const ACTION_REF = "common_types.json#/$defs/Action";
const DYNAMIC_PROPERTY_REFS: Readonly<Record<string, DynamicPropertyKind>> = {
  "common_types.json#/$defs/DynamicString": "dynamicString",
  "common_types.json#/$defs/DynamicNumber": "dynamicNumber",
  "common_types.json#/$defs/DynamicBoolean": "dynamicBoolean",
  "common_types.json#/$defs/DynamicStringList": "dynamicStringList",
};

const DYNAMIC_FUNCTION_ARGUMENT_REFS: Readonly<Record<string, DynamicPropertyKind | "dynamicValue">> = {
  ...DYNAMIC_PROPERTY_REFS,
  "common_types.json#/$defs/DynamicValue": "dynamicValue",
  "https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString": "dynamicString",
  "https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicNumber": "dynamicNumber",
  "https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean": "dynamicBoolean",
  "https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicStringList": "dynamicStringList",
  "https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicValue": "dynamicValue",
  "https://a2ui.org/specification/v0_9_1/common_types.json#/$defs/DynamicString": "dynamicString",
  "https://a2ui.org/specification/v0_9_1/common_types.json#/$defs/DynamicNumber": "dynamicNumber",
  "https://a2ui.org/specification/v0_9_1/common_types.json#/$defs/DynamicBoolean": "dynamicBoolean",
  "https://a2ui.org/specification/v0_9_1/common_types.json#/$defs/DynamicStringList": "dynamicStringList",
  "https://a2ui.org/specification/v0_9_1/common_types.json#/$defs/DynamicValue": "dynamicValue",
  "#/$defs/DynamicString": "dynamicString",
  "#/$defs/DynamicNumber": "dynamicNumber",
  "#/$defs/DynamicBoolean": "dynamicBoolean",
  "#/$defs/DynamicStringList": "dynamicStringList",
  "#/$defs/DynamicValue": "dynamicValue",
};
const FUNCTION_RETURN_TYPES: readonly CatalogFunctionReturnType[] = [
  "string", "number", "boolean", "array", "object", "any", "void",
];

function isPlainObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function functionArgumentDefinition(schema: JsonObject | undefined): CatalogFunctionArgumentDefinition {
  if (schema === undefined) return { kind: "dynamicValue" };
  const reference = typeof schema.$ref === "string" ? DYNAMIC_FUNCTION_ARGUMENT_REFS[schema.$ref] : undefined;
  if (reference !== undefined) return { kind: reference };

  if (schema.type === "array" && isPlainObject(schema.items)) {
    const item = functionArgumentDefinition(schema.items);
    if (item.kind === "dynamicValue" || item.kind === "dynamicString" || item.kind === "dynamicNumber" ||
      item.kind === "dynamicBoolean" || item.kind === "dynamicStringList") {
      return { kind: "arrayOfDynamicValues" };
    }
  }

  if (schema.type === "object") {
    const properties = isPlainObject(schema.properties) ? schema.properties : undefined;
    if (properties !== undefined) {
      const fields: Record<string, CatalogFunctionArgumentDefinition> = {};
      for (const [name, value] of Object.entries(properties)) {
        if (isPlainObject(value)) fields[name] = functionArgumentDefinition(value);
      }
      return { kind: "literalObject", properties: fields };
    }
    return { kind: "literalObject" };
  }

  // A schema without a type is the A2UI convention for an unrestricted dynamic value.
  if (schema.type === undefined && schema.$ref === undefined && schema.oneOf === undefined && schema.anyOf === undefined) {
    return { kind: "dynamicValue" };
  }
  return { kind: "literal" };
}

function discoverFunctionDefinition(
  catalogId: string,
  name: string,
  functionSchema: JsonObject,
): CatalogFunctionDefinition | undefined {
  const properties = isPlainObject(functionSchema.properties) ? functionSchema.properties : undefined;
  const returnTypeSchema = properties !== undefined && isPlainObject(properties.returnType)
    ? properties.returnType
    : undefined;
  const returnType = returnTypeSchema?.const;
  if (returnType !== undefined && (typeof returnType !== "string" || !FUNCTION_RETURN_TYPES.includes(returnType as CatalogFunctionReturnType))) {
    return undefined;
  }
  const argsSchema = properties !== undefined && isPlainObject(properties.args) ? properties.args : undefined;
  const argsProperties = argsSchema !== undefined && isPlainObject(argsSchema.properties) ? argsSchema.properties : undefined;
  const args: Record<string, CatalogFunctionArgumentDefinition> = {};
  for (const [argName, schema] of Object.entries(argsProperties ?? {})) {
    if (isPlainObject(schema)) args[argName] = functionArgumentDefinition(schema);
  }
  return {
    catalogId,
    name,
    returnType: (returnType as CatalogFunctionReturnType | undefined) ?? "any",
    arguments: args,
  };
}

function cloneFunctionDefinition(definition: CatalogFunctionDefinition): CatalogFunctionDefinition {
  const argumentsCopy: Record<string, CatalogFunctionArgumentDefinition> = {};
  for (const [name, argument] of Object.entries(definition.arguments)) {
    argumentsCopy[name] = {
      kind: argument.kind,
      ...(argument.properties === undefined ? {} : { properties: cloneArgumentDefinitions(argument.properties) }),
    };
  }
  return { ...definition, arguments: argumentsCopy };
}

function cloneArgumentDefinitions(
  definitions: Readonly<Record<string, CatalogFunctionArgumentDefinition>>,
): Record<string, CatalogFunctionArgumentDefinition> {
  const result: Record<string, CatalogFunctionArgumentDefinition> = {};
  for (const [name, definition] of Object.entries(definitions)) {
    result[name] = {
      kind: definition.kind,
      ...(definition.properties === undefined ? {} : { properties: cloneArgumentDefinitions(definition.properties) }),
    };
  }
  return result;
}

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

function discoverStructureLocations(componentSchema: JsonObject): ComponentStructureLocation[] {
  const locations: ComponentStructureLocation[] = [];
  const visit = (schema: JsonObject, path: ComponentStructureLocationSegment[]): void => {
    if (schema.$ref === COMPONENT_ID_REF) {
      locations.push({ path: path.map((segment) => ({ ...segment })), kind: "single" });
      return;
    }
    if (schema.$ref === CHILD_LIST_REF) {
      locations.push({ path: path.map((segment) => ({ ...segment })), kind: "list" });
      return;
    }
    if (isPlainObject(schema.properties)) {
      for (const [name, child] of Object.entries(schema.properties)) {
        if (isPlainObject(child)) visit(child, [...path, { kind: "property", name }]);
      }
    }
    if (isPlainObject(schema.items)) visit(schema.items, [...path, { kind: "arrayItems" }]);
  };
  visit(componentSchema, []);
  // Preserve the legacy direct traversal contract: all direct singles precede direct lists.
  locations.sort((left, right) => left.path.length === 1 && right.path.length === 1
    ? (left.kind === right.kind ? 0 : left.kind === "single" ? -1 : 1)
    : 0);
  return locations;
}

function discoverActionProperties(componentSchema: JsonObject): string[] {
  const properties = componentSchema.properties;
  if (!isPlainObject(properties)) return [];
  return Object.entries(properties).flatMap(([property, schema]) =>
    isPlainObject(schema) && schema.$ref === ACTION_REF ? [property] : []
  );
}

function isCheckable(componentSchema: JsonObject): boolean {
  return Array.isArray(componentSchema.allOf) && componentSchema.allOf.some((entry) =>
    isPlainObject(entry) && entry.$ref === CHECKABLE_REF
  );
}

function dynamicKind(schema: JsonObject): DynamicPropertyKind | undefined {
  const direct = typeof schema.$ref === "string" ? DYNAMIC_PROPERTY_REFS[schema.$ref] : undefined;
  if (direct !== undefined) return direct;
  if (!Array.isArray(schema.allOf)) return undefined;
  for (const member of schema.allOf) {
    if (!isPlainObject(member) || typeof member.$ref !== "string") continue;
    const wrapped = DYNAMIC_PROPERTY_REFS[member.$ref];
    if (wrapped !== undefined) return wrapped;
  }
  return undefined;
}

function discoverDynamicValueLocations(componentSchema: JsonObject): DynamicValueLocation[] {
  const locations: DynamicValueLocation[] = [];
  const visit = (schema: JsonObject, path: DynamicValueLocationSegment[]): void => {
    const valueKind = dynamicKind(schema);
    if (valueKind !== undefined) {
      locations.push({ path: path.map((segment) => ({ ...segment })), valueKind });
      return;
    }
    if (isPlainObject(schema.properties)) {
      for (const [name, child] of Object.entries(schema.properties)) {
        if (isPlainObject(child)) visit(child, [...path, { kind: "property", name }]);
      }
    }
    if (isPlainObject(schema.items)) visit(schema.items, [...path, { kind: "arrayItems" }]);
  };
  visit(componentSchema, []);
  return locations;
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
    const functionValidators = new Map<string, ValidateFunction>();
    const functionDefinitions = new Map<string, CatalogFunctionDefinition>();
    const structures = new Map<string, ComponentStructureDefinition>();
    const structureLocations = new Map<string, readonly ComponentStructureLocation[]>();
    const dynamicProperties = new Map<string, readonly DynamicPropertyDefinition[]>();
    const dynamicValueLocations = new Map<string, readonly DynamicValueLocation[]>();
    const actionProperties = new Map<string, readonly string[]>();
    const checkableComponents = new Set<string>();
    const functions = schema.functions === undefined ? {} : schema.functions;
    if (!isPlainObject(functions)) {
      return { ok: false, error: error("INVALID_CATALOG_SCHEMA", catalogId, "Catalog functions must be an object") };
    }
    let themeValidator: ValidateFunction;
    try {
      for (const [componentName, componentSchema] of Object.entries(components)) {
        if (componentSchema === null || Array.isArray(componentSchema) || typeof componentSchema !== "object") {
          throw new Error("invalid component schema");
        }
        if (!this.#ajv.validateSchema(componentSchema)) throw new Error("invalid component schema");
        structures.set(componentName, discoverStructure(componentSchema));
        structureLocations.set(componentName, discoverStructureLocations(componentSchema));
        dynamicProperties.set(componentName, discoverDynamicProperties(componentSchema));
        dynamicValueLocations.set(componentName, discoverDynamicValueLocations(componentSchema));
        actionProperties.set(componentName, discoverActionProperties(componentSchema));
        if (isCheckable(componentSchema)) checkableComponents.add(componentName);
        const compilationSchema = cloneJson(schema);
        compilationSchema.$id = `https://weaver.invalid/catalog/${this.#registrationSequence}/${encodeURIComponent(componentName)}/catalog.json`;
        compilationSchema.$ref = `#/components/${escapeJsonPointer(componentName)}`;
        validators.set(componentName, this.#ajv.compile(compilationSchema));
      }
      for (const [functionName, functionSchema] of Object.entries(functions)) {
        if (!isPlainObject(functionSchema) || !this.#ajv.validateSchema(functionSchema)) {
          throw new Error("invalid function schema");
        }
        const definition = discoverFunctionDefinition(catalogId, functionName, functionSchema);
        if (definition === undefined) throw new Error("unsupported function return type");
        const compilationSchema = cloneJson(schema);
        compilationSchema.$id = `https://weaver.invalid/catalog/${this.#registrationSequence}/${encodeURIComponent(functionName)}/function.json`;
        compilationSchema.$ref = `#/functions/${escapeJsonPointer(functionName)}`;
        functionValidators.set(functionName, this.#ajv.compile(compilationSchema));
        functionDefinitions.set(functionName, definition);
      }
      const themeCompilationSchema = cloneJson(schema);
      themeCompilationSchema.$id = `https://weaver.invalid/catalog/${this.#registrationSequence}/theme/catalog.json`;
      themeCompilationSchema.$ref = "#/$defs/theme";
      themeValidator = this.#ajv.compile(themeCompilationSchema);
    } catch {
      return { ok: false, error: error("INVALID_CATALOG_SCHEMA", catalogId, "Catalog schemas could not be compiled") };
    }

    this.#registrationSequence += 1;
    this.#catalogs.set(catalogId, {
      schema,
      validators,
      functionValidators,
      functionDefinitions,
      structures,
      structureLocations,
      dynamicProperties,
      dynamicValueLocations,
      actionProperties,
      checkableComponents,
      themeValidator,
    });
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

  hasFunction(catalogId: string, functionName: string): boolean {
    return this.#catalogs.get(catalogId)?.functionValidators.has(functionName) ?? false;
  }

  /** Detects only the direct standard A2UI Checkable allOf mixin reference. */
  isComponentCheckable(catalogId: string, componentName: string): boolean {
    return this.#catalogs.get(catalogId)?.checkableComponents.has(componentName) ?? false;
  }

  getFunctionDefinition(catalogId: string, functionName: string): CatalogFunctionDefinitionResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return { ok: false, error: error("CATALOG_NOT_FOUND", catalogId, "Catalog is not registered") };
    }
    const definition = catalog.functionDefinitions.get(functionName);
    if (definition === undefined) {
      return {
        ok: false,
        error: {
          ...error("FUNCTION_NOT_ALLOWED", catalogId, "Function is not allowed by the catalog"),
          functionName,
        },
      };
    }
    return { ok: true, value: cloneFunctionDefinition(definition) };
  }

  validateFunctionCall(catalogId: string, functionCall: unknown): CatalogFunctionValidationResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return { ok: false, error: error("CATALOG_NOT_FOUND", catalogId, "Catalog is not registered") };
    }
    const functionName = isPlainObject(functionCall) && typeof functionCall.call === "string"
      ? functionCall.call
      : undefined;
    if (functionName === undefined || !catalog.functionValidators.has(functionName)) {
      return {
        ok: false,
        error: {
          ...error("FUNCTION_NOT_ALLOWED", catalogId, "Function is not allowed by the catalog"),
          ...(functionName === undefined ? {} : { functionName }),
        },
      };
    }

    const issues: CatalogValidationIssue[] = [];
    if (!isPlainObject(functionCall) || !isPlainObject(functionCall.args) ||
      ("returnType" in functionCall &&
        (typeof functionCall.returnType !== "string" || !FUNCTION_RETURN_TYPES.includes(functionCall.returnType as CatalogFunctionReturnType)))) {
      issues.push({ path: "/", message: "FunctionCall must contain a call name and object args", keyword: "type" });
    }
    const validator = catalog.functionValidators.get(functionName)!;
    if (issues.length === 0 && !validator(functionCall)) issues.push(...normalizeErrors(validator.errors));
    if (issues.length > 0) {
      return {
        ok: false,
        error: {
          ...error("FUNCTION_VALIDATION_FAILED", catalogId, "Function call does not satisfy the catalog schema"),
          functionName,
          issues,
        },
      };
    }
    return { ok: true, value: functionCall };
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

  getComponentStructureLocations(
    catalogId: string,
    componentName: string,
  ): CatalogComponentStructureLocationsResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return { ok: false, error: error("CATALOG_NOT_FOUND", catalogId, "Catalog is not registered") };
    }
    const locations = catalog.structureLocations.get(componentName);
    if (locations === undefined) {
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
      value: locations.map(({ path, kind }) => ({
        path: path.map((segment) => ({ ...segment })),
        kind,
      })),
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

  getDynamicValueLocations(catalogId: string, componentName: string): CatalogDynamicValueLocationsResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return { ok: false, error: error("CATALOG_NOT_FOUND", catalogId, "Catalog is not registered") };
    }
    const locations = catalog.dynamicValueLocations.get(componentName);
    if (locations === undefined) {
      return {
        ok: false,
        error: {
          ...error("COMPONENT_STRUCTURE_NOT_FOUND", catalogId, "Component property metadata is not available"),
          component: componentName,
        },
      };
    }
    return {
      ok: true,
      value: locations.map(({ path, valueKind }) => ({
        path: path.map((segment) => ({ ...segment })),
        valueKind,
      })),
    };
  }

  /** Detects only direct common_types.json#/$defs/Action property references. */
  getActionProperties(catalogId: string, componentName: string): CatalogActionPropertiesResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return { ok: false, error: error("CATALOG_NOT_FOUND", catalogId, "Catalog is not registered") };
    }
    const properties = catalog.actionProperties.get(componentName);
    if (properties === undefined) {
      return {
        ok: false,
        error: {
          ...error("COMPONENT_STRUCTURE_NOT_FOUND", catalogId, "Component action metadata is not available"),
          component: componentName,
        },
      };
    }
    return { ok: true, value: [...properties] };
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

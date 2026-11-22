import type { A2UIComponent, JsonObject } from "../protocol/index.js";
import { cloneJson } from "../data-model/clone.js";
import type { CatalogRegistryError } from "./errors.js";
import { buildCatalogCommonTypes } from "./common-types.js";
import {
  A2UI_CATALOG_ALLOWED_CALLERS,
  A2UI_CATALOG_FUNCTION_RETURN_TYPES,
  A2UI_CATALOG_IDENTIFIER_PATTERN,
  A2UI_CATALOG_SCHEMA,
} from "./schema.js";
import {
  isValidSchema,
  referencesResolve,
  SchemaValidator,
  type SchemaValidationIssue,
} from "./schema-validator.js";
import type {
  BindableValueLocation,
  CatalogActionPropertiesResult,
  CatalogBindableValueLocationsResult,
  CatalogComponentStructureLocationsResult,
  CatalogComponentStructureResult,
  CatalogComponentValidationResult,
  CatalogDynamicPropertiesResult,
  CatalogDynamicValueLocationsResult,
  CatalogFunctionAllowedCallers,
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
  CatalogValidationIssue,
} from "./types.js";

interface RegisteredCatalog {
  schema: JsonObject;
  validators: ReadonlyMap<string, SchemaValidator>;
  functionValidators: ReadonlyMap<string, SchemaValidator>;
  functionDefinitions: ReadonlyMap<string, CatalogFunctionDefinition>;
  /** The raw declaration of each function, kept for the defaults of its arguments. */
  functionArgumentSchemas: ReadonlyMap<string, JsonObject>;
  structures: ReadonlyMap<string, ComponentStructureDefinition>;
  structureLocations: ReadonlyMap<
    string,
    readonly ComponentStructureLocation[]
  >;
  dynamicProperties: ReadonlyMap<string, readonly DynamicPropertyDefinition[]>;
  dynamicValueLocations: ReadonlyMap<string, readonly DynamicValueLocation[]>;
  bindableValueLocations: ReadonlyMap<string, readonly BindableValueLocation[]>;
  bindableValueValidators: ReadonlyMap<string, SchemaValidator>;
  actionProperties: ReadonlyMap<string, readonly string[]>;
  checkableComponents: ReadonlySet<string>;
}

/** The only external document a v1.0 catalog may reference, by its relative name. */
const COMMON_TYPES_DOCUMENT = "common_types.json";
/** The absolute v1.0 form is accepted as an alias and rewritten to the relative form on registration. */
const COMMON_TYPES_ABSOLUTE_PREFIX =
  "https://a2ui.org/specification/v1_0/common_types.json#";
const ALLOWED_COMMON_TYPE_REFS: ReadonlySet<string> = new Set(
  [
    "ComponentId",
    "Child",
    "ChildList",
    "DynamicString",
    "DynamicNumber",
    "DynamicBoolean",
    "DynamicStringList",
    "DynamicValue",
    "AccessibilityAttributes",
    "CheckRule",
    "Checkable",
    "Action",
    "DataBinding",
    "FunctionCall",
  ].map((name) => `${COMMON_TYPES_DOCUMENT}#/$defs/${name}`),
);

/** Child references: a single component ID, which is either ComponentId or Child. */
const COMPONENT_ID_REFS: ReadonlySet<string> = new Set([
  "common_types.json#/$defs/ComponentId",
  "common_types.json#/$defs/Child",
]);
const CHILD_LIST_REF = "common_types.json#/$defs/ChildList";
const CHECKABLE_REF = "common_types.json#/$defs/Checkable";
const ACTION_REF = "common_types.json#/$defs/Action";
const DATA_BINDING_REFS: ReadonlySet<string> = new Set([
  "common_types.json#/$defs/DataBinding",
]);
const FUNCTION_CALL_REFS: ReadonlySet<string> = new Set([
  "common_types.json#/$defs/FunctionCall",
]);
const DYNAMIC_PROPERTY_REFS: Readonly<Record<string, DynamicPropertyKind>> = {
  "common_types.json#/$defs/DynamicString": "dynamicString",
  "common_types.json#/$defs/DynamicNumber": "dynamicNumber",
  "common_types.json#/$defs/DynamicBoolean": "dynamicBoolean",
  "common_types.json#/$defs/DynamicStringList": "dynamicStringList",
};

const DYNAMIC_FUNCTION_ARGUMENT_REFS: Readonly<
  Record<string, DynamicPropertyKind | "dynamicValue">
> = {
  ...DYNAMIC_PROPERTY_REFS,
  "common_types.json#/$defs/DynamicValue": "dynamicValue",
  "#/$defs/DynamicString": "dynamicString",
  "#/$defs/DynamicNumber": "dynamicNumber",
  "#/$defs/DynamicBoolean": "dynamicBoolean",
  "#/$defs/DynamicStringList": "dynamicStringList",
  "#/$defs/DynamicValue": "dynamicValue",
};

/**
 * ComponentCommon envelope keys that the agent-to-renderer envelope validates.
 * Catalog component definitions describe only catalog-owned properties, so
 * these keys are removed before a component instance is validated.
 */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  "id",
  "@catalogId",
  "@accessibility",
  "@metadata",
]);
/** The Checkable mixin's property, declared by common types and exempt from the identifier rule. */
const CHECKABLE_MIXIN_PROPERTY = "@checks";
const IDENTIFIER = new RegExp(A2UI_CATALOG_IDENTIFIER_PATTERN, "u");

function isPlainObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFunctionReturnType(value: unknown): value is CatalogFunctionReturnType {
  return (A2UI_CATALOG_FUNCTION_RETURN_TYPES as readonly unknown[]).includes(value);
}

function isAllowedCallers(value: unknown): value is CatalogFunctionAllowedCallers {
  return (A2UI_CATALOG_ALLOWED_CALLERS as readonly unknown[]).includes(value);
}

function pointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? [...value]
    : undefined;
}

function functionArgumentDefinition(
  schema: JsonObject | undefined,
): CatalogFunctionArgumentDefinition {
  if (schema === undefined) return { kind: "dynamicValue" };
  const reference =
    typeof schema.$ref === "string"
      ? DYNAMIC_FUNCTION_ARGUMENT_REFS[schema.$ref]
      : undefined;
  if (reference !== undefined) return { kind: reference };

  if (schema.type === "array" && isPlainObject(schema.items)) {
    const item = functionArgumentDefinition(schema.items);
    if (
      item.kind === "dynamicValue" ||
      item.kind === "dynamicString" ||
      item.kind === "dynamicNumber" ||
      item.kind === "dynamicBoolean" ||
      item.kind === "dynamicStringList"
    ) {
      return { kind: "arrayOfDynamicValues", items: item };
    }
  }

  if (schema.type === "object") {
    const properties = isPlainObject(schema.properties)
      ? schema.properties
      : undefined;
    if (properties !== undefined) {
      const fields: Record<string, CatalogFunctionArgumentDefinition> = {};
      for (const [name, value] of Object.entries(properties)) {
        if (isPlainObject(value))
          fields[name] = functionArgumentDefinition(value);
      }
      return { kind: "literalObject", properties: fields };
    }
    return { kind: "literalObject" };
  }

  // A schema without a type is the A2UI convention for an unrestricted dynamic value.
  if (
    schema.type === undefined &&
    schema.$ref === undefined &&
    schema.oneOf === undefined &&
    schema.anyOf === undefined
  ) {
    return { kind: "dynamicValue" };
  }
  return { kind: "literal" };
}

function discoverFunctionDefinition(
  catalogId: string,
  name: string,
  functionSchema: JsonObject,
): CatalogFunctionDefinition | undefined {
  const returnType = functionSchema.returnType;
  if (!isFunctionReturnType(returnType)) return undefined;
  const allowedCallers = functionSchema.allowedCallers ?? "rendererOnly";
  if (!isAllowedCallers(allowedCallers)) return undefined;
  const requiresUserActivation = functionSchema.requiresUserActivation ?? false;
  if (typeof requiresUserActivation !== "boolean") return undefined;
  if (requiresUserActivation && allowedCallers !== "rendererOnly") return undefined;

  const properties = isPlainObject(functionSchema.properties)
    ? functionSchema.properties
    : undefined;
  const argsSchema =
    properties !== undefined && isPlainObject(properties.args)
      ? properties.args
      : undefined;
  const argsProperties =
    argsSchema !== undefined && isPlainObject(argsSchema.properties)
      ? argsSchema.properties
      : undefined;
  const args: Record<string, CatalogFunctionArgumentDefinition> = {};
  for (const [argName, schema] of Object.entries(argsProperties ?? {})) {
    if (isPlainObject(schema))
      args[argName] = functionArgumentDefinition(schema);
  }
  return {
    catalogId,
    name,
    returnType,
    allowedCallers,
    requiresUserActivation,
    arguments: args,
  };
}

function cloneFunctionDefinition(
  definition: CatalogFunctionDefinition,
): CatalogFunctionDefinition {
  const argumentsCopy: Record<string, CatalogFunctionArgumentDefinition> = {};
  for (const [name, argument] of Object.entries(definition.arguments)) {
    argumentsCopy[name] = cloneArgumentDefinition(argument);
  }
  return { ...definition, arguments: argumentsCopy };
}

function cloneArgumentDefinition(
  definition: CatalogFunctionArgumentDefinition,
): CatalogFunctionArgumentDefinition {
  return {
    kind: definition.kind,
    ...(definition.properties === undefined
      ? {}
      : { properties: cloneArgumentDefinitions(definition.properties) }),
    ...(definition.items === undefined ? {} : { items: cloneArgumentDefinition(definition.items) }),
  };
}

function cloneArgumentDefinitions(
  definitions: Readonly<Record<string, CatalogFunctionArgumentDefinition>>,
): Record<string, CatalogFunctionArgumentDefinition> {
  const result: Record<string, CatalogFunctionArgumentDefinition> = {};
  for (const [name, definition] of Object.entries(definitions)) {
    result[name] = cloneArgumentDefinition(definition);
  }
  return result;
}

function discoverStructure(
  componentSchema: JsonObject,
): ComponentStructureDefinition {
  const structure: ComponentStructureDefinition = {
    singleChildFields: [],
    childListFields: [],
  };
  const properties = componentSchema.properties;
  if (
    properties === null ||
    Array.isArray(properties) ||
    typeof properties !== "object"
  )
    return structure;

  for (const [property, propertySchema] of Object.entries(properties)) {
    if (
      propertySchema === null ||
      Array.isArray(propertySchema) ||
      typeof propertySchema !== "object"
    )
      continue;
    if (
      typeof propertySchema.$ref === "string" &&
      COMPONENT_ID_REFS.has(propertySchema.$ref)
    )
      structure.singleChildFields.push(property);
    if (propertySchema.$ref === CHILD_LIST_REF)
      structure.childListFields.push(property);
  }
  const allowedParents = stringArray(componentSchema.allowedParents);
  if (allowedParents !== undefined) structure.allowedParents = allowedParents;
  const allowedChildren = stringArray(componentSchema.allowedChildren);
  if (allowedChildren !== undefined) structure.allowedChildren = allowedChildren;
  return structure;
}

function discoverStructureLocations(
  componentSchema: JsonObject,
): ComponentStructureLocation[] {
  const locations: ComponentStructureLocation[] = [];
  const visit = (
    schema: JsonObject,
    path: ComponentStructureLocationSegment[],
  ): void => {
    if (typeof schema.$ref === "string" && COMPONENT_ID_REFS.has(schema.$ref)) {
      locations.push({
        path: path.map((segment) => ({ ...segment })),
        kind: "single",
      });
      return;
    }
    if (schema.$ref === CHILD_LIST_REF) {
      locations.push({
        path: path.map((segment) => ({ ...segment })),
        kind: "list",
      });
      return;
    }
    if (isPlainObject(schema.properties)) {
      for (const [name, child] of Object.entries(schema.properties)) {
        if (isPlainObject(child))
          visit(child, [...path, { kind: "property", name }]);
      }
    }
    if (isPlainObject(schema.items))
      visit(schema.items, [...path, { kind: "arrayItems" }]);
  };
  visit(componentSchema, []);
  // Preserve the legacy direct traversal contract: all direct singles precede direct lists.
  locations.sort((left, right) =>
    left.path.length === 1 && right.path.length === 1
      ? left.kind === right.kind
        ? 0
        : left.kind === "single"
          ? -1
          : 1
      : 0,
  );
  return locations;
}

function discoverActionProperties(componentSchema: JsonObject): string[] {
  const properties = componentSchema.properties;
  if (!isPlainObject(properties)) return [];
  return Object.entries(properties).flatMap(([property, schema]) =>
    isPlainObject(schema) && schema.$ref === ACTION_REF ? [property] : [],
  );
}

function isCheckable(componentSchema: JsonObject): boolean {
  return (
    Array.isArray(componentSchema.allOf) &&
    componentSchema.allOf.some(
      (entry) => isPlainObject(entry) && entry.$ref === CHECKABLE_REF,
    )
  );
}

/** Property locations also recognize DynamicValue; the input-binding map above stays scalar-only. */
const DYNAMIC_VALUE_LOCATION_REFS: Readonly<Record<string, DynamicPropertyKind | "dynamicValue">> = {
  ...DYNAMIC_PROPERTY_REFS,
  "common_types.json#/$defs/DynamicValue": "dynamicValue",
};

function dynamicKind(
  schema: JsonObject,
  refs: Readonly<Record<string, DynamicPropertyKind | "dynamicValue">> = DYNAMIC_PROPERTY_REFS,
): DynamicPropertyKind | "dynamicValue" | undefined {
  const direct =
    typeof schema.$ref === "string"
      ? refs[schema.$ref]
      : undefined;
  if (direct !== undefined) return direct;
  if (!Array.isArray(schema.allOf)) return undefined;
  for (const member of schema.allOf) {
    if (!isPlainObject(member) || typeof member.$ref !== "string") continue;
    const wrapped = refs[member.$ref];
    if (wrapped !== undefined) return wrapped;
  }
  return undefined;
}

function discoverDynamicValueLocations(
  componentSchema: JsonObject,
): DynamicValueLocation[] {
  const locations: DynamicValueLocation[] = [];
  const visit = (
    schema: JsonObject,
    path: DynamicValueLocationSegment[],
  ): void => {
    const valueKind = dynamicKind(schema, DYNAMIC_VALUE_LOCATION_REFS);
    if (valueKind !== undefined) {
      locations.push({
        path: path.map((segment) => ({ ...segment })),
        valueKind,
      });
      return;
    }
    if (isPlainObject(schema.properties)) {
      for (const [name, child] of Object.entries(schema.properties)) {
        if (isPlainObject(child))
          visit(child, [...path, { kind: "property", name }]);
      }
    }
    if (isPlainObject(schema.items))
      visit(schema.items, [...path, { kind: "arrayItems" }]);
  };
  visit(componentSchema, []);
  return locations;
}

interface DiscoveredBindableValue extends BindableValueLocation {
  literalSchemas: JsonObject[];
}

function discoverBindableValues(
  componentSchema: JsonObject,
): DiscoveredBindableValue[] {
  const locations: DiscoveredBindableValue[] = [];
  const visit = (
    schema: JsonObject,
    path: DynamicValueLocationSegment[],
  ): void => {
    if (Array.isArray(schema.oneOf)) {
      const branches = schema.oneOf.filter(isPlainObject);
      const bindingBranches = branches.filter(
        (branch) =>
          typeof branch.$ref === "string" && DATA_BINDING_REFS.has(branch.$ref),
      );
      const hasFunctionCall = branches.some(
        (branch) =>
          typeof branch.$ref === "string" &&
          FUNCTION_CALL_REFS.has(branch.$ref),
      );
      if (
        branches.length === schema.oneOf.length &&
        bindingBranches.length === 1 &&
        !hasFunctionCall
      ) {
        locations.push({
          path: path.map((segment) => ({ ...segment })),
          literalSchemas: branches
            .filter((branch) => branch !== bindingBranches[0])
            .map(cloneJson),
        });
        return;
      }
    }
    if (isPlainObject(schema.properties)) {
      for (const [name, child] of Object.entries(schema.properties)) {
        if (isPlainObject(child))
          visit(child, [...path, { kind: "property", name }]);
      }
    }
    if (isPlainObject(schema.items))
      visit(schema.items, [...path, { kind: "arrayItems" }]);
  };
  visit(componentSchema, []);
  return locations.filter(({ literalSchemas }) => literalSchemas.length > 0);
}

function bindableLocationKey(
  path: readonly DynamicValueLocationSegment[],
): string {
  return JSON.stringify(path);
}

function discoverDynamicProperties(
  componentSchema: JsonObject,
): DynamicPropertyDefinition[] {
  const definitions: DynamicPropertyDefinition[] = [];
  const properties = componentSchema.properties;
  if (
    properties === null ||
    Array.isArray(properties) ||
    typeof properties !== "object"
  )
    return definitions;
  for (const [property, propertySchema] of Object.entries(properties)) {
    if (
      propertySchema === null ||
      Array.isArray(propertySchema) ||
      typeof propertySchema !== "object"
    )
      continue;
    const valueKind =
      typeof propertySchema.$ref === "string"
        ? DYNAMIC_PROPERTY_REFS[propertySchema.$ref]
        : undefined;
    if (valueKind !== undefined) definitions.push({ property, valueKind });
  }
  return definitions;
}

/**
 * Rewrites the absolute v1.0 common_types.json references to the relative
 * form in a caller-owned clone. Other absolute references are left in place so
 * the external-reference policy rejects them.
 */
function rewriteCommonTypeAliases(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) rewriteCommonTypeAliases(entry);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string" && child.startsWith(COMMON_TYPES_ABSOLUTE_PREFIX)) {
      value[key] = `${COMMON_TYPES_DOCUMENT}#${child.slice(COMMON_TYPES_ABSOLUTE_PREFIX.length)}`;
    } else {
      rewriteCommonTypeAliases(child);
    }
  }
}

function embeddedCommonTypesIssues(value: unknown, path: string): CatalogValidationIssue[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => embeddedCommonTypesIssues(entry, `${path}/${index}`));
  }
  if (!isPlainObject(value)) return [];
  const own: CatalogValidationIssue[] =
    value.$id === COMMON_TYPES_DOCUMENT
      ? [{
          path: path === "" ? "/" : path,
          message: "common_types.json is built into Weaver and must not be embedded in a catalog",
          keyword: "$id",
        }]
      : [];
  return [
    ...own,
    ...Object.entries(value).flatMap(([key, child]) =>
      embeddedCommonTypesIssues(child, `${path}/${pointerSegment(key)}`),
    ),
  ];
}

function collectEmbeddedDocuments(value: unknown, documents: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectEmbeddedDocuments(entry, documents);
    return;
  }
  if (!isPlainObject(value)) return;
  if (typeof value.$id === "string") documents.add(value.$id);
  for (const child of Object.values(value)) collectEmbeddedDocuments(child, documents);
}

/**
 * Enforces the v1.0 catalog policy that needs the whole document: UAX #31
 * identifiers, `@call` matching the function name, and external `$ref` targets.
 * External targets are limited to the standard common_types.json names, and
 * only when that document is embedded in the catalog. Nothing is fetched.
 */
function catalogSemanticIssues(schema: JsonObject): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];

  if (isPlainObject(schema.components)) {
    for (const [name, definition] of Object.entries(schema.components)) {
      const base = `/components/${pointerSegment(name)}`;
      if (!IDENTIFIER.test(name)) {
        issues.push({ path: base, message: "Component name must be a UAX #31 identifier", keyword: "pattern" });
      }
      if (isPlainObject(definition) && isPlainObject(definition.properties)) {
        for (const property of Object.keys(definition.properties)) {
          if (property === CHECKABLE_MIXIN_PROPERTY || IDENTIFIER.test(property)) continue;
          issues.push({
            path: `${base}/properties/${pointerSegment(property)}`,
            message: "Property name must be a UAX #31 identifier",
            keyword: "pattern",
          });
        }
      }
    }
  }

  if (isPlainObject(schema.functions)) {
    for (const [name, definition] of Object.entries(schema.functions)) {
      const base = `/functions/${pointerSegment(name)}`;
      if (!IDENTIFIER.test(name)) {
        issues.push({ path: base, message: "Function name must be a UAX #31 identifier", keyword: "pattern" });
      }
      const call = isPlainObject(definition) && isPlainObject(definition.properties)
        ? definition.properties["@call"]
        : undefined;
      if (!isPlainObject(call) || call.const !== name) {
        issues.push({
          path: `${base}/properties/@call/const`,
          message: "The @call const must equal the function name",
          keyword: "const",
        });
      }
    }
  }

  // The built-in common types are always available, so a catalog may not embed them.
  // The rule is strict rejection, not "accept when identical": one embedded copy would
  // otherwise be a second, unversioned source of the standard definitions.
  issues.push(...embeddedCommonTypesIssues(schema, ""));
  const embedded = new Set<string>([COMMON_TYPES_DOCUMENT]);
  collectEmbeddedDocuments(schema, embedded);
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}/${index}`));
      return;
    }
    if (!isPlainObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") {
        const reference = externalReferenceIssue(child, embedded, path);
        if (reference !== undefined) issues.push(reference);
      } else {
        visit(child, `${path}/${pointerSegment(key)}`);
      }
    }
  };
  visit(schema, "");
  return issues;
}

function externalReferenceIssue(
  reference: string,
  embedded: ReadonlySet<string>,
  path: string,
): CatalogValidationIssue | undefined {
  const hash = reference.indexOf("#");
  const document = hash < 0 ? reference : reference.slice(0, hash);
  if (document === "") return undefined;
  if (embedded.has(document)) {
    if (document !== COMMON_TYPES_DOCUMENT || ALLOWED_COMMON_TYPE_REFS.has(reference)) return undefined;
  }
  return {
    path: path === "" ? "/" : path,
    message: `Unsupported external $ref: ${reference}`,
    keyword: "$ref",
  };
}

function error(
  code: CatalogRegistryError["code"],
  catalogId: string,
  message: string,
): CatalogRegistryError {
  return { code, catalogId, message };
}

function normalizeErrors(
  errors: readonly SchemaValidationIssue[],
): CatalogValidationIssue[] {
  return errors.map(({ path, message, keyword }) => ({
    path,
    message,
    keyword,
  }));
}

/**
 * A caller-owned compilation document with its own resource identity. The
 * built-in common_types.json resource is embedded here, for compilation only,
 * so every relative or absolute v1.0 common-types reference resolves locally.
 */
function compilationDocument(schema: JsonObject, id: string): JsonObject {
  const catalogDocument = cloneJson(schema);
  catalogDocument.$id = id;
  if (!isPlainObject(catalogDocument.$defs)) catalogDocument.$defs = {};
  (catalogDocument.$defs as JsonObject).weaverCommonTypes = buildCatalogCommonTypes();
  return catalogDocument;
}

/** Strips the ComponentCommon envelope keys before validating catalog-owned properties. */
function catalogOwnedBody(component: A2UIComponent): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(component)) {
    if (!ENVELOPE_KEYS.has(key)) body[key] = value;
  }
  return body;
}

/** The defaults of the schema's properties, applied to the value where it omits them. Object schemas recurse. */
function withSchemaDefaults(value: JsonObject, schema: unknown): JsonObject {
  if (!isPlainObject(schema) || !isPlainObject(schema.properties)) return value;
  const result: JsonObject = { ...value };
  for (const [name, propertySchema] of Object.entries(schema.properties)) {
    if (!isPlainObject(propertySchema)) continue;
    const current = result[name];
    if (current === undefined && propertySchema.default !== undefined) {
      result[name] = cloneJson(propertySchema.default);
    } else if (isPlainObject(current)) {
      result[name] = withSchemaDefaults(current, propertySchema);
    }
  }
  return result;
}

export class CatalogRegistry {
  readonly #validateCatalogShape = new SchemaValidator(A2UI_CATALOG_SCHEMA);
  readonly #catalogs = new Map<string, RegisteredCatalog>();
  #registrationSequence = 0;

  register(
    registration: CatalogRegistration,
  ): CatalogRegistryResult<CatalogSnapshot> {
    const { catalogId } = registration;
    if (this.#catalogs.has(catalogId)) {
      return {
        ok: false,
        error: error(
          "CATALOG_ALREADY_REGISTERED",
          catalogId,
          "Catalog is already registered",
        ),
      };
    }

    let schema: JsonObject;
    try {
      schema = cloneJson(registration.schema);
    } catch {
      return {
        ok: false,
        error: error(
          "INVALID_CATALOG_SCHEMA",
          catalogId,
          "Catalog schema must be JSON data",
        ),
      };
    }
    rewriteCommonTypeAliases(schema);

    const catalogShape = this.#validateCatalogShape.validate(schema);
    const issues = normalizeErrors(catalogShape.issues);
    if (catalogShape.valid) issues.push(...catalogSemanticIssues(schema));
    if (schema.catalogId !== catalogId) {
      issues.push({
        path: "/catalogId",
        message: "Must match the registration catalogId",
        keyword: "const",
      });
    }
    if (issues.length > 0) {
      return {
        ok: false,
        error: {
          ...error(
            "INVALID_CATALOG_SCHEMA",
            catalogId,
            "Catalog schema is invalid",
          ),
          issues,
        },
      };
    }

    const components = (schema.components ?? {}) as JsonObject;
    const validators = new Map<string, SchemaValidator>();
    const functionValidators = new Map<string, SchemaValidator>();
    const functionArgumentSchemas = new Map<string, JsonObject>();
    const functionDefinitions = new Map<string, CatalogFunctionDefinition>();
    const structures = new Map<string, ComponentStructureDefinition>();
    const structureLocations = new Map<
      string,
      readonly ComponentStructureLocation[]
    >();
    const dynamicProperties = new Map<
      string,
      readonly DynamicPropertyDefinition[]
    >();
    const dynamicValueLocations = new Map<
      string,
      readonly DynamicValueLocation[]
    >();
    const bindableValueLocations = new Map<
      string,
      readonly BindableValueLocation[]
    >();
    const bindableValueValidators = new Map<string, SchemaValidator>();
    const actionProperties = new Map<string, readonly string[]>();
    const checkableComponents = new Set<string>();
    const functions = (schema.functions ?? {}) as JsonObject;
    try {
      for (const [componentName, componentSchema] of Object.entries(
        components,
      )) {
        if (
          componentSchema === null ||
          Array.isArray(componentSchema) ||
          typeof componentSchema !== "object"
        ) {
          throw new Error("invalid component schema");
        }
        if (!isValidSchema(componentSchema))
          throw new Error("invalid component schema");
        structures.set(componentName, discoverStructure(componentSchema));
        structureLocations.set(
          componentName,
          discoverStructureLocations(componentSchema),
        );
        dynamicProperties.set(
          componentName,
          discoverDynamicProperties(componentSchema),
        );
        dynamicValueLocations.set(
          componentName,
          discoverDynamicValueLocations(componentSchema),
        );
        const bindableValues = discoverBindableValues(componentSchema);
        bindableValueLocations.set(
          componentName,
          bindableValues.map(({ path }) => ({ path })),
        );
        for (const [index, bindable] of bindableValues.entries()) {
          const compilationSchema = compilationDocument(
            schema,
            `https://weaver.invalid/catalog/${this.#registrationSequence}/${encodeURIComponent(componentName)}/bindable-${index}/catalog.json`,
          );
          (compilationSchema.$defs as JsonObject)[`weaverBindable${index}`] = {
            oneOf: bindable.literalSchemas,
          };
          compilationSchema.$ref = `#/$defs/weaverBindable${index}`;
          if (!referencesResolve(compilationSchema))
            throw new Error("unresolved schema reference");
          bindableValueValidators.set(
            `${componentName}:${bindableLocationKey(bindable.path)}`,
            new SchemaValidator(compilationSchema),
          );
        }
        actionProperties.set(
          componentName,
          discoverActionProperties(componentSchema),
        );
        if (isCheckable(componentSchema))
          checkableComponents.add(componentName);
        const compilationSchema = compilationDocument(
          schema,
          `https://weaver.invalid/catalog/${this.#registrationSequence}/${encodeURIComponent(componentName)}/catalog.json`,
        );
        (compilationSchema.$defs as JsonObject).weaverComponent =
          cloneJson(componentSchema);
        compilationSchema.$ref = "#/$defs/weaverComponent";
        if (!referencesResolve(compilationSchema))
          throw new Error("unresolved schema reference");
        validators.set(componentName, new SchemaValidator(compilationSchema));
      }
      for (const [functionName, functionSchema] of Object.entries(functions)) {
        if (!isPlainObject(functionSchema) || !isValidSchema(functionSchema)) {
          throw new Error("invalid function schema");
        }
        const definition = discoverFunctionDefinition(
          catalogId,
          functionName,
          functionSchema,
        );
        if (definition === undefined)
          throw new Error("unsupported function declaration");
        const compilationSchema = compilationDocument(
          schema,
          `https://weaver.invalid/catalog/${this.#registrationSequence}/${encodeURIComponent(functionName)}/function.json`,
        );
        (compilationSchema.$defs as JsonObject).weaverFunction =
          cloneJson(functionSchema);
        compilationSchema.$ref = "#/$defs/weaverFunction";
        if (!referencesResolve(compilationSchema))
          throw new Error("unresolved schema reference");
        functionValidators.set(
          functionName,
          new SchemaValidator(compilationSchema),
        );
        functionDefinitions.set(functionName, definition);
        functionArgumentSchemas.set(functionName, functionSchema);
      }
    } catch {
      return {
        ok: false,
        error: error(
          "INVALID_CATALOG_SCHEMA",
          catalogId,
          "Catalog schemas could not be compiled",
        ),
      };
    }

    this.#registrationSequence += 1;
    this.#catalogs.set(catalogId, {
      schema,
      validators,
      functionValidators,
      functionDefinitions,
      functionArgumentSchemas,
      structures,
      structureLocations,
      dynamicProperties,
      dynamicValueLocations,
      bindableValueLocations,
      bindableValueValidators,
      actionProperties,
      checkableComponents,
    });
    return { ok: true, value: { catalogId, schema: cloneJson(schema) } };
  }

  has(catalogId: string): boolean {
    return this.#catalogs.has(catalogId);
  }

  get(catalogId: string): CatalogSnapshot | undefined {
    const catalog = this.#catalogs.get(catalogId);
    return catalog === undefined
      ? undefined
      : { catalogId, schema: cloneJson(catalog.schema) };
  }

  list(): CatalogSnapshot[] {
    return [...this.#catalogs].map(([catalogId, catalog]) => ({
      catalogId,
      schema: cloneJson(catalog.schema),
    }));
  }

  getSupportedCatalogIds(): string[] {
    return [...this.#catalogs.keys()];
  }

  hasFunction(catalogId: string, functionName: string): boolean {
    return (
      this.#catalogs.get(catalogId)?.functionValidators.has(functionName) ??
      false
    );
  }

  /** Detects only the direct standard A2UI Checkable allOf mixin reference. */
  isComponentCheckable(catalogId: string, componentName: string): boolean {
    return (
      this.#catalogs.get(catalogId)?.checkableComponents.has(componentName) ??
      false
    );
  }

  getFunctionDefinition(
    catalogId: string,
    functionName: string,
  ): CatalogFunctionDefinitionResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return {
        ok: false,
        error: error(
          "CATALOG_NOT_FOUND",
          catalogId,
          "Catalog is not registered",
        ),
      };
    }
    const definition = catalog.functionDefinitions.get(functionName);
    if (definition === undefined) {
      return {
        ok: false,
        error: {
          ...error(
            "FUNCTION_NOT_ALLOWED",
            catalogId,
            "Function is not allowed by the catalog",
          ),
          functionName,
        },
      };
    }
    return { ok: true, value: cloneFunctionDefinition(definition) };
  }

  validateFunctionCall(
    catalogId: string,
    functionCall: unknown,
  ): CatalogFunctionValidationResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return {
        ok: false,
        error: error(
          "CATALOG_NOT_FOUND",
          catalogId,
          "Catalog is not registered",
        ),
      };
    }
    const functionName =
      isPlainObject(functionCall) && typeof functionCall["@call"] === "string"
        ? functionCall["@call"]
        : undefined;
    if (
      functionName === undefined ||
      !catalog.functionValidators.has(functionName)
    ) {
      return {
        ok: false,
        error: {
          ...error(
            "FUNCTION_NOT_ALLOWED",
            catalogId,
            "Function is not allowed by the catalog",
          ),
          ...(functionName === undefined ? {} : { functionName }),
        },
      };
    }

    const issues: CatalogValidationIssue[] = [];
    if (!isPlainObject(functionCall)) {
      issues.push({
        path: "/",
        message: "FunctionCall must be an object",
        keyword: "type",
      });
    } else if (functionCall.args !== undefined && !isPlainObject(functionCall.args)) {
      // args is optional in v1.0 (FunctionCommon requires only @call); when present it must be an object.
      issues.push({
        path: "/args",
        message: "FunctionCall args must be an object when present",
        keyword: "type",
      });
    }
    // Declaration-only keys belong to the catalog definition, never the wire call.
    if (isPlainObject(functionCall)) {
      for (const key of ["returnType", "allowedCallers"]) {
        if (key in functionCall) {
          issues.push({
            path: `/${key}`,
            message: `A FunctionCall must not declare ${key}; set it in the catalog function definition`,
            keyword: "additionalProperties",
          });
        }
      }
    }
    const validator = catalog.functionValidators.get(functionName)!;
    if (issues.length === 0) {
      // An absent args is validated as {} so the required arguments of the function still apply.
      const candidate = isPlainObject(functionCall) && functionCall.args === undefined
        ? { ...functionCall, args: {} }
        : functionCall;
      const validation = validator.validate(candidate);
      if (!validation.valid) issues.push(...normalizeErrors(validation.issues));
    }
    if (issues.length > 0) {
      return {
        ok: false,
        error: {
          ...error(
            "FUNCTION_VALIDATION_FAILED",
            catalogId,
            "Function call does not satisfy the catalog schema",
          ),
          functionName,
          issues,
        },
      };
    }
    return { ok: true, value: functionCall };
  }

  /**
   * Applies the schema `default` of each argument that the call omits, through object
   * schemas. Validation does not apply defaults, so a call that is sent to the agent is
   * built with them. An unknown function returns the arguments unchanged.
   */
  applyFunctionArgumentDefaults(catalogId: string, functionName: string, args: JsonObject): JsonObject {
    const functionSchema = this.#catalogs.get(catalogId)?.functionArgumentSchemas.get(functionName);
    const properties = isPlainObject(functionSchema?.properties) ? functionSchema.properties : undefined;
    return withSchemaDefaults(args, properties?.args);
  }

  getComponentStructure(
    catalogId: string,
    componentName: string,
  ): CatalogComponentStructureResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return {
        ok: false,
        error: error(
          "CATALOG_NOT_FOUND",
          catalogId,
          "Catalog is not registered",
        ),
      };
    }
    const structure = catalog.structures.get(componentName);
    if (structure === undefined) {
      return {
        ok: false,
        error: {
          ...error(
            "COMPONENT_STRUCTURE_NOT_FOUND",
            catalogId,
            "Component structural metadata is not available",
          ),
          component: componentName,
        },
      };
    }
    return {
      ok: true,
      value: {
        singleChildFields: [...structure.singleChildFields],
        childListFields: [...structure.childListFields],
        ...(structure.allowedParents === undefined
          ? {}
          : { allowedParents: [...structure.allowedParents] }),
        ...(structure.allowedChildren === undefined
          ? {}
          : { allowedChildren: [...structure.allowedChildren] }),
      },
    };
  }

  /**
   * True when the component's catalog schema declares the property directly. A
   * bare envelope-like name (checks, accessibility, metadata, catalogId) is an
   * ordinary property only when this is true.
   */
  declaresComponentProperty(
    catalogId: string,
    componentName: string,
    property: string,
  ): boolean {
    const catalog = this.#catalogs.get(catalogId);
    const components = catalog?.schema.components;
    if (components === null || typeof components !== "object" || Array.isArray(components)) return false;
    const component = (components as JsonObject)[componentName];
    if (component === null || typeof component !== "object" || Array.isArray(component)) return false;
    const properties = (component as JsonObject).properties;
    return (
      properties !== null &&
      typeof properties === "object" &&
      !Array.isArray(properties) &&
      Object.hasOwn(properties, property)
    );
  }

  getComponentStructureLocations(
    catalogId: string,
    componentName: string,
  ): CatalogComponentStructureLocationsResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return {
        ok: false,
        error: error(
          "CATALOG_NOT_FOUND",
          catalogId,
          "Catalog is not registered",
        ),
      };
    }
    const locations = catalog.structureLocations.get(componentName);
    if (locations === undefined) {
      return {
        ok: false,
        error: {
          ...error(
            "COMPONENT_STRUCTURE_NOT_FOUND",
            catalogId,
            "Component structural metadata is not available",
          ),
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

  getDynamicProperties(
    catalogId: string,
    componentName: string,
  ): CatalogDynamicPropertiesResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return {
        ok: false,
        error: error(
          "CATALOG_NOT_FOUND",
          catalogId,
          "Catalog is not registered",
        ),
      };
    }
    const definitions = catalog.dynamicProperties.get(componentName);
    if (definitions === undefined) {
      return {
        ok: false,
        error: {
          ...error(
            "COMPONENT_STRUCTURE_NOT_FOUND",
            catalogId,
            "Component property metadata is not available",
          ),
          component: componentName,
        },
      };
    }
    return {
      ok: true,
      value: definitions.map((definition) => ({ ...definition })),
    };
  }

  getDynamicValueLocations(
    catalogId: string,
    componentName: string,
  ): CatalogDynamicValueLocationsResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return {
        ok: false,
        error: error(
          "CATALOG_NOT_FOUND",
          catalogId,
          "Catalog is not registered",
        ),
      };
    }
    const locations = catalog.dynamicValueLocations.get(componentName);
    if (locations === undefined) {
      return {
        ok: false,
        error: {
          ...error(
            "COMPONENT_STRUCTURE_NOT_FOUND",
            catalogId,
            "Component property metadata is not available",
          ),
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

  getBindableValueLocations(
    catalogId: string,
    componentName: string,
  ): CatalogBindableValueLocationsResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined)
      return {
        ok: false,
        error: error(
          "CATALOG_NOT_FOUND",
          catalogId,
          "Catalog is not registered",
        ),
      };
    const locations = catalog.bindableValueLocations.get(componentName);
    if (locations === undefined)
      return {
        ok: false,
        error: {
          ...error(
            "COMPONENT_STRUCTURE_NOT_FOUND",
            catalogId,
            "Component property metadata is not available",
          ),
          component: componentName,
        },
      };
    return {
      ok: true,
      value: locations.map(({ path }) => ({
        path: path.map((segment) => ({ ...segment })),
      })),
    };
  }

  /** Validates a hydrated bindable value without exposing the private schema validator. */
  validateBindableValue(
    catalogId: string,
    componentName: string,
    location: BindableValueLocation,
    value: unknown,
  ): boolean {
    const validator = this.#catalogs
      .get(catalogId)
      ?.bindableValueValidators.get(
        `${componentName}:${bindableLocationKey(location.path)}`,
      );
    return validator?.validate(value).valid ?? false;
  }

  /** Detects only direct common_types.json#/$defs/Action property references. */
  getActionProperties(
    catalogId: string,
    componentName: string,
  ): CatalogActionPropertiesResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return {
        ok: false,
        error: error(
          "CATALOG_NOT_FOUND",
          catalogId,
          "Catalog is not registered",
        ),
      };
    }
    const properties = catalog.actionProperties.get(componentName);
    if (properties === undefined) {
      return {
        ok: false,
        error: {
          ...error(
            "COMPONENT_STRUCTURE_NOT_FOUND",
            catalogId,
            "Component action metadata is not available",
          ),
          component: componentName,
        },
      };
    }
    return { ok: true, value: [...properties] };
  }

  validateComponent(
    catalogId: string,
    component: A2UIComponent,
  ): CatalogComponentValidationResult {
    const catalog = this.#catalogs.get(catalogId);
    if (catalog === undefined) {
      return {
        ok: false,
        error: error(
          "CATALOG_NOT_FOUND",
          catalogId,
          "Catalog is not registered",
        ),
      };
    }

    const validator = catalog.validators.get(component.component);
    if (validator === undefined) {
      return {
        ok: false,
        error: {
          ...error(
            "COMPONENT_NOT_ALLOWED",
            catalogId,
            "Component type is not allowed by the catalog",
          ),
          componentId: component.id,
          component: component.component,
        },
      };
    }

    const componentId = component.id;
    const componentName = component.component;
    const validation = validator.validate(catalogOwnedBody(component));
    if (!validation.valid) {
      return {
        ok: false,
        error: {
          ...error(
            "COMPONENT_VALIDATION_FAILED",
            catalogId,
            "Component does not satisfy the catalog schema",
          ),
          componentId,
          component: componentName,
          issues: normalizeErrors(validation.issues),
        },
      };
    }
    return { ok: true, value: component };
  }
}

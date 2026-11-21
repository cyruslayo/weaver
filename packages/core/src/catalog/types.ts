import type { A2UIComponent, JsonObject } from "../protocol/index.js";
import type { CatalogRegistryError } from "./errors.js";

export interface CatalogRegistration {
  catalogId: string;
  schema: JsonObject;
}

export interface CatalogSnapshot {
  catalogId: string;
  schema: JsonObject;
}

/**
 * Structural metadata for a component. `allowedParents` and `allowedChildren`
 * are present only when the catalog declares them; when absent, every parent
 * and every child component type is allowed.
 */
export interface ComponentStructureDefinition {
  singleChildFields: string[];
  childListFields: string[];
  allowedParents?: string[];
  allowedChildren?: string[];
}

export type DynamicPropertyKind =
  | "dynamicString"
  | "dynamicNumber"
  | "dynamicBoolean"
  | "dynamicStringList";

export type CatalogFunctionReturnType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "validationResult"
  | "any"
  | "void";

/** Which roles may invoke a catalog function; the catalog default is rendererOnly. */
export type CatalogFunctionAllowedCallers = "rendererOnly" | "agentOnly" | "rendererOrAgent";

export type CatalogFunctionArgumentKind =
  | "dynamicValue"
  | DynamicPropertyKind
  | "arrayOfDynamicValues"
  | "literal"
  | "literalObject";

export interface CatalogFunctionArgumentDefinition {
  kind: CatalogFunctionArgumentKind;
  properties?: Readonly<Record<string, CatalogFunctionArgumentDefinition>>;
}

export interface CatalogFunctionDefinition {
  catalogId: string;
  name: string;
  returnType: CatalogFunctionReturnType;
  allowedCallers: CatalogFunctionAllowedCallers;
  requiresUserActivation: boolean;
  arguments: Readonly<Record<string, CatalogFunctionArgumentDefinition>>;
}

export interface DynamicPropertyDefinition {
  property: string;
  valueKind: DynamicPropertyKind;
}

export type DynamicValueLocationSegment =
  | { kind: "property"; name: string }
  | { kind: "arrayItems" };

export interface DynamicValueLocation {
  path: readonly DynamicValueLocationSegment[];
  valueKind: DynamicPropertyKind;
}

/** A location whose direct oneOf combines literal values with one DataBinding. */
export interface BindableValueLocation {
  path: readonly DynamicValueLocationSegment[];
}

export type ComponentStructureLocationSegment = DynamicValueLocationSegment;

export interface ComponentStructureLocation {
  path: readonly ComponentStructureLocationSegment[];
  kind: "single" | "list";
}

export interface CatalogValidationIssue {
  path: string;
  message: string;
  keyword?: string;
}

export type CatalogRegistryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CatalogRegistryError };

export type CatalogComponentValidationResult = CatalogRegistryResult<A2UIComponent>;
export type CatalogComponentStructureResult = CatalogRegistryResult<ComponentStructureDefinition>;
export type CatalogComponentStructureLocationsResult = CatalogRegistryResult<ComponentStructureLocation[]>;
export type CatalogDynamicPropertiesResult = CatalogRegistryResult<DynamicPropertyDefinition[]>;
export type CatalogDynamicValueLocationsResult = CatalogRegistryResult<DynamicValueLocation[]>;
export type CatalogBindableValueLocationsResult = CatalogRegistryResult<BindableValueLocation[]>;
export type CatalogActionPropertiesResult = CatalogRegistryResult<string[]>;
export type CatalogFunctionDefinitionResult = CatalogRegistryResult<CatalogFunctionDefinition>;
export type CatalogFunctionValidationResult = CatalogRegistryResult<unknown>;

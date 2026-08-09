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

export interface ComponentStructureDefinition {
  singleChildFields: string[];
  childListFields: string[];
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
  | "any"
  | "void";

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
  arguments: Readonly<Record<string, CatalogFunctionArgumentDefinition>>;
}

export interface DynamicPropertyDefinition {
  property: string;
  valueKind: DynamicPropertyKind;
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
export type CatalogThemeValidationResult = CatalogRegistryResult<JsonObject>;
export type CatalogComponentStructureResult = CatalogRegistryResult<ComponentStructureDefinition>;
export type CatalogDynamicPropertiesResult = CatalogRegistryResult<DynamicPropertyDefinition[]>;
export type CatalogActionPropertiesResult = CatalogRegistryResult<string[]>;
export type CatalogFunctionDefinitionResult = CatalogRegistryResult<CatalogFunctionDefinition>;
export type CatalogFunctionValidationResult = CatalogRegistryResult<unknown>;

import type {
  CatalogFunctionArgumentDefinition,
  CatalogFunctionDefinition,
  CatalogRegistry,
} from "../catalog/index.js";
import { cloneJson } from "../data-model/clone.js";
import { DataContext, isDataPathBinding } from "../data-context/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { FunctionRegistry } from "./FunctionRegistry.js";
import type {
  FunctionCall,
  FunctionEvaluationResult,
  FunctionExecutionContext,
  FunctionReturnType,
} from "./types.js";
import { isFunctionCall } from "./types.js";
import type { FunctionEvaluationError } from "./errors.js";

const MAX_DEFAULT_DEPTH = 32;

type InternalResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: FunctionEvaluationError };

function isPlainObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonSafe(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const safe = Array.isArray(value)
    ? Object.keys(value).length === value.length && value.every((entry) => isJsonSafe(entry, ancestors))
    : isPlainObject(value) && Object.values(value).every((entry) => isJsonSafe(entry, ancestors));
  ancestors.delete(value);
  return safe;
}

function defensiveValue(value: unknown, catalogId: string, functionName: string): InternalResult<unknown> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isJsonSafe(value)) {
    return {
      ok: false,
      error: {
        code: "FUNCTION_ARGUMENT_RESOLUTION_FAILED",
        message: "Function argument is not JSON-compatible",
        catalogId,
        functionName,
      },
    };
  }
  return { ok: true, value: cloneJson(value) };
}

function actualType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && !Number.isFinite(value)) return "non-finite number";
  if (typeof value === "object" && !isPlainObject(value)) return "class instance";
  return typeof value;
}

function validReturnValue(value: unknown, expected: FunctionReturnType): boolean {
  if (expected === "void") return value === undefined;
  if (!isJsonSafe(value)) return false;
  switch (expected) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "array": return Array.isArray(value);
    case "object": return isPlainObject(value);
    case "any": return true;
  }
}

function argumentError(
  catalogId: string,
  functionName: string,
  message: string,
  cause?: import("../data-context/index.js").DataContextError,
): InternalResult<never> {
  return {
    ok: false,
    error: {
      code: "FUNCTION_ARGUMENT_RESOLUTION_FAILED",
      message,
      catalogId,
      functionName,
      ...(cause === undefined ? {} : { cause }),
    },
  };
}

/** Executes catalog-declared functions using only host-registered implementations. */
export class FunctionEvaluator {
  readonly #catalogs: CatalogRegistry;
  readonly #functions: FunctionRegistry;
  readonly #maxDepth: number;

  constructor(
    catalogs: CatalogRegistry,
    functions: FunctionRegistry,
    options: { maxDepth?: number } = {},
  ) {
    this.#catalogs = catalogs;
    this.#functions = functions;
    this.#maxDepth = Number.isSafeInteger(options.maxDepth) && (options.maxDepth ?? 0) > 0
      ? options.maxDepth!
      : MAX_DEFAULT_DEPTH;
  }

  evaluate(
    catalogId: string,
    functionCall: unknown,
    dataContext: DataContext,
  ): FunctionEvaluationResult {
    return this.#evaluate(catalogId, functionCall, dataContext, 0);
  }

  #evaluate(
    catalogId: string,
    functionCall: unknown,
    dataContext: DataContext,
    depth: number,
  ): FunctionEvaluationResult {
    let validation: ReturnType<CatalogRegistry["validateFunctionCall"]>;
    try {
      validation = this.#catalogs.validateFunctionCall(catalogId, functionCall);
    } catch {
      return {
        ok: false,
        error: {
          code: "FUNCTION_VALIDATION_FAILED",
          message: "Function call validation failed",
          catalogId,
          issues: [{ path: "/", message: "Unable to inspect FunctionCall", keyword: "type" }],
        },
      };
    }
    if (!validation.ok) return { ok: false, error: validation.error };
    if (!isFunctionCall(validation.value)) {
      return {
        ok: false,
        error: {
          code: "FUNCTION_VALIDATION_FAILED",
          message: "Validated value is not a FunctionCall",
          catalogId,
          functionName: "",
          issues: [{ path: "/", message: "Expected FunctionCall", keyword: "type" }],
        },
      };
    }
    const call = validation.value as FunctionCall;
    if (depth >= this.#maxDepth) {
      return {
        ok: false,
        error: {
          code: "FUNCTION_MAX_DEPTH_EXCEEDED",
          message: `Function nesting exceeds the Weaver limit of ${this.#maxDepth}`,
          catalogId,
          functionName: call.call,
        },
      };
    }

    const functionName = call.call;
    const definitionResult = this.#catalogs.getFunctionDefinition(catalogId, functionName);
    if (!definitionResult.ok) return { ok: false, error: definitionResult.error };
    const definition = definitionResult.value;
    const implementation = this.#functions.getImplementation(catalogId, functionName);
    if (implementation === undefined) {
      return {
        ok: false,
        error: {
          code: "FUNCTION_IMPLEMENTATION_NOT_FOUND",
          message: "The catalog function has no registered implementation",
          catalogId,
          functionName,
        },
      };
    }

    const resolvedArgs: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(call.args)) {
      const resolved = this.#resolveArgument(
        catalogId,
        functionName,
        value as JsonValue,
        definition.arguments[name] ?? { kind: "literal" },
        dataContext,
        depth,
      );
      if (!resolved.ok) return resolved;
      resolvedArgs[name] = resolved.value;
    }

    let result: unknown;
    try {
      const context: FunctionExecutionContext = { catalogId, dataContext };
      result = implementation(resolvedArgs, context);
    } catch {
      return {
        ok: false,
        error: {
          code: "FUNCTION_EXECUTION_FAILED",
          message: "Trusted function implementation failed",
          catalogId,
          functionName,
        },
      };
    }

    if (!validReturnValue(result, definition.returnType)) {
      return {
        ok: false,
        error: {
          code: "FUNCTION_RETURN_TYPE_MISMATCH",
          message: "Function implementation returned a value outside its catalog contract",
          catalogId,
          functionName,
          expected: definition.returnType,
          actual: actualType(result),
        },
      };
    }
    return { ok: true, value: result === undefined ? undefined : cloneJson(result as JsonValue) };
  }

  #resolveArgument(
    catalogId: string,
    functionName: string,
    value: JsonValue,
    definition: CatalogFunctionArgumentDefinition,
    dataContext: DataContext,
    depth: number,
  ): InternalResult<unknown> {
    if (definition.kind === "arrayOfDynamicValues") {
      if (!Array.isArray(value)) return defensiveValue(value, catalogId, functionName);
      const values: unknown[] = [];
      for (const entry of value) {
        const resolved = this.#resolveArgument(catalogId, functionName, entry, { kind: "dynamicValue" }, dataContext, depth);
        if (!resolved.ok) return resolved;
        values.push(resolved.value);
      }
      return { ok: true, value: values };
    }

    if (definition.kind === "literalObject") {
      if (!isPlainObject(value)) return defensiveValue(value, catalogId, functionName);
      const fields: Record<string, unknown> = {};
      for (const [name, entry] of Object.entries(value)) {
        const fieldDefinition = definition.properties?.[name];
        const resolved = fieldDefinition === undefined
          ? defensiveValue(entry, catalogId, functionName)
          : this.#resolveArgument(catalogId, functionName, entry, fieldDefinition, dataContext, depth);
        if (!resolved.ok) return resolved;
        fields[name] = resolved.value;
      }
      return { ok: true, value: fields };
    }

    if (definition.kind === "dynamicValue" || definition.kind === "dynamicString" ||
      definition.kind === "dynamicNumber" || definition.kind === "dynamicBoolean" ||
      definition.kind === "dynamicStringList") {
      if (isDataPathBinding(value)) {
        const resolved = dataContext.resolveBinding(value);
        if (!resolved.ok) return argumentError(catalogId, functionName, "Data binding could not be resolved", resolved.error);
        return defensiveValue(resolved.value, catalogId, functionName);
      }
      if (isFunctionCall(value)) return this.#evaluate(catalogId, value, dataContext, depth + 1);
    }

    return defensiveValue(value, catalogId, functionName);
  }
}

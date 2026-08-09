import type { CatalogRegistry } from "../catalog/index.js";
import { DataContext, isDataPathBinding } from "../data-context/index.js";
import { FunctionEvaluator, isFunctionCall } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { ActionContextResolutionResult } from "./types.js";

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson) as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)])) as T;
}

function isAllowedLiteral(value: unknown): value is string | number | boolean | JsonValue[] {
  return typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) || Array.isArray(value);
}

/** Resolves event fields atomically using A2UI DynamicValue semantics. */
export class ActionContextResolver {
  constructor(
    private readonly catalogs: CatalogRegistry,
    private readonly functionEvaluator: FunctionEvaluator,
  ) {}

  resolve(catalogId: string, context: JsonObject, dataContext: DataContext): ActionContextResolutionResult {
    const resolved: JsonObject = {};
    for (const [key, value] of Object.entries(context)) {
      if (isDataPathBinding(value)) {
        const binding = dataContext.resolveBinding(value);
        if (!binding.ok) {
          return { ok: false, error: { code: "ACTION_CONTEXT_RESOLUTION_FAILED", message: "Event context binding could not be resolved", key } };
        }
        if (binding.value === undefined) {
          return { ok: false, error: { code: "ACTION_CONTEXT_VALUE_UNAVAILABLE", message: "Event context value is unavailable", key } };
        }
        resolved[key] = cloneJson(binding.value);
        continue;
      }
      if (isFunctionCall(value)) {
        const definition = this.catalogs.getFunctionDefinition(catalogId, value.call);
        if (definition.ok && definition.value.returnType === "void") {
          return { ok: false, error: { code: "ACTION_CONTEXT_VOID_FUNCTION", message: "Void functions cannot produce event context", key, functionName: value.call } };
        }
        const evaluated = this.functionEvaluator.evaluate(catalogId, value, dataContext);
        if (!evaluated.ok) {
          return { ok: false, error: { code: "ACTION_CONTEXT_RESOLUTION_FAILED", message: "Event context function failed", key, cause: evaluated.error } };
        }
        if (evaluated.value === undefined) {
          return { ok: false, error: { code: "ACTION_CONTEXT_VALUE_UNAVAILABLE", message: "Event context value is unavailable", key } };
        }
        resolved[key] = cloneJson(evaluated.value);
        continue;
      }
      if (!isAllowedLiteral(value)) {
        return { ok: false, error: { code: "ACTION_CONTEXT_RESOLUTION_FAILED", message: "Event context value is not an allowed DynamicValue", key } };
      }
      // Arrays are literal JSON and are deliberately not recursively interpreted.
      resolved[key] = cloneJson(value);
    }
    return { ok: true, value: resolved };
  }
}

import type { CatalogRegistry } from "../catalog/index.js";
import { functionCallCatalogId } from "../catalog/catalogResolution.js";
import type { AgentFunctionScope } from "../agent-functions/types.js";
import { cloneJson } from "../data-model/clone.js";
import { DataContext } from "../data-context/index.js";
import {
  FunctionEvaluator,
  isDataBinding,
  isFunctionCall,
  unescapeLiteralDynamicValue,
} from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { ActionContextResolutionResult } from "./types.js";

/**
 * Resolves event context values as DynamicValues: a DataBinding is read, a
 * FunctionCall is evaluated, and any other value is a literal whose reserved keys
 * are checked and unescaped. Resolution is atomic: one failing value fails the event.
 */
export class ActionContextResolver {
  constructor(
    private readonly catalogs: CatalogRegistry,
    private readonly functionEvaluator: FunctionEvaluator,
  ) {}

  /**
   * Entries resolve in declared order. An entry that waits on an agent call stops
   * the resolution there, so later entries are not evaluated until it settles. The
   * result then has `awaiting` set and an incomplete value.
   */
  resolve(
    surfaceCatalogId: string | undefined,
    context: JsonObject,
    dataContext: DataContext,
    scope?: AgentFunctionScope,
  ): ActionContextResolutionResult {
    const resolved: JsonObject = {};
    for (const [key, value] of Object.entries(context)) {
      if (isDataBinding(value)) {
        const binding = dataContext.resolveBinding(value);
        if (!binding.ok) {
          return {
            ok: false,
            error: { code: "ACTION_CONTEXT_RESOLUTION_FAILED", message: "Event context binding could not be resolved", key },
          };
        }
        if (binding.value === undefined) {
          return {
            ok: false,
            error: { code: "ACTION_CONTEXT_VALUE_UNAVAILABLE", message: "Event context value is unavailable", key },
          };
        }
        resolved[key] = cloneJson(binding.value);
        continue;
      }
      if (isFunctionCall(value)) {
        const functionName = value["@call"];
        // The void check reads the call's own resolved catalog. An unresolvable call is reported by evaluation below.
        const callCatalog = functionCallCatalogId(value, surfaceCatalogId);
        const definition =
          callCatalog === undefined ? undefined : this.catalogs.getFunctionDefinition(callCatalog, functionName);
        if (definition?.ok && definition.value.returnType === "void") {
          return {
            ok: false,
            error: {
              code: "ACTION_CONTEXT_VOID_FUNCTION",
              message: "Void functions cannot produce event context",
              key,
              functionName,
            },
          };
        }
        const evaluated = this.functionEvaluator.evaluate(surfaceCatalogId, value, dataContext, scope);
        if (!evaluated.ok) {
          return {
            ok: false,
            error: {
              code: "ACTION_CONTEXT_RESOLUTION_FAILED",
              message: "Event context function failed",
              key,
              cause: evaluated.error,
            },
          };
        }
        if (evaluated.awaiting !== undefined) return { ok: true, value: resolved, awaiting: evaluated.awaiting };
        if (evaluated.value === undefined) {
          return {
            ok: false,
            error: { code: "ACTION_CONTEXT_VALUE_UNAVAILABLE", message: "Event context value is unavailable", key },
          };
        }
        resolved[key] = cloneJson(evaluated.value);
        continue;
      }
      const literal = unescapeLiteralDynamicValue(value as JsonValue);
      if (!literal.ok) {
        return {
          ok: false,
          error: {
            code: "INVALID_RESERVED_KEY",
            message: `Event context contains the reserved key "${literal.error.key}"`,
            key,
            reservedKey: literal.error.key,
            path: literal.error.path,
          },
        };
      }
      resolved[key] = literal.value;
    }
    return { ok: true, value: resolved };
  }
}

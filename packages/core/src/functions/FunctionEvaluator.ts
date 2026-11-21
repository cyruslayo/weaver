import type {
  CatalogFunctionArgumentDefinition,
  CatalogRegistry,
} from "../catalog/index.js";
import type { AgentFunctionRouter, AgentFunctionScope } from "../agent-functions/types.js";
import { cloneJson } from "../data-model/clone.js";
import { DataContext } from "../data-context/index.js";
import type { DataContextError } from "../data-context/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { FunctionRegistry } from "./FunctionRegistry.js";
import {
  coerceDynamicBoolean,
  isDataBinding,
  isFunctionCall,
  unescapeLiteralDynamicValue,
} from "./dynamic.js";
import type {
  FunctionCall,
  FunctionEvaluationResult,
  FunctionExecutionContext,
  FunctionReturnType,
} from "./types.js";
import type { FunctionEvaluationError } from "./errors.js";

const MAX_DEFAULT_DEPTH = 32;
/** The reserved system function. It belongs to no catalog and is always available. */
const INDEX_FUNCTION = "@index";
const INDEX_ARGUMENT_NAMES: ReadonlySet<string> = new Set(["offset"]);
const SEVERITIES: ReadonlySet<string> = new Set(["error", "warning", "info"]);

class RecursiveFunctionFailure {
  constructor(readonly error: FunctionEvaluationError) {}
}

type InternalResult<T> =
  | { ok: true; value: T; awaiting?: string }
  | { ok: false; error: FunctionEvaluationError };

export interface FunctionEvaluatorOptions {
  maxDepth?: number;
  /**
   * Routes calls that have no local implementation to the agent. Without it, such
   * a call fails locally with EXPRESSION_ERROR. See agent-functions.
   */
  agentRouter?: AgentFunctionRouter;
}

/** Per-evaluation state. Activation is honored only at the action root. */
interface EvaluationFrame {
  depth: number;
  actionRoot: boolean;
  userActivation: boolean;
  /**
   * "agent" only for the root of an agent-initiated callRendererFunction. Nested
   * calls in its arguments are always "renderer" frames.
   */
  caller: "renderer" | "agent";
  /** Where a routed agent call belongs. Absent for an agent-initiated root, which never routes. */
  scope?: AgentFunctionScope;
}

type DynamicArgumentKind = "dynamicValue" | "dynamicString" | "dynamicNumber" | "dynamicBoolean" | "dynamicStringList";

const PASSIVE_FRAME = { depth: 0, actionRoot: false, userActivation: false, caller: "renderer" } as const;

function isPlainObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonSafe(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  const active = new Set<object>();
  const stack: ({ value: unknown; exit: false } | { value: object; exit: true })[] = [{ value, exit: false }];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.exit) {
      active.delete(frame.value);
      continue;
    }
    const current = frame.value;
    if (current === null || typeof current === "string" || typeof current === "boolean") continue;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (typeof current !== "object" || active.has(current)) return false;
    if (Array.isArray(current)) {
      if (Object.keys(current).length !== current.length) return false;
    } else if (!isPlainObject(current)) return false;
    active.add(current);
    stack.push({ value: current, exit: true });
    if (Array.isArray(current)) for (const entry of current) stack.push({ value: entry, exit: false });
    else for (const entry of Object.values(current)) stack.push({ value: entry, exit: false });
  }
  return true;
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

/** A ValidationResult: a boolean `valid`, with optional well-typed code, message and severity. */
function isValidationResultValue(value: unknown): boolean {
  if (!isPlainObject(value) || typeof value.valid !== "boolean") return false;
  if (value.code !== undefined && typeof value.code !== "string") return false;
  if (value.message !== undefined && typeof value.message !== "string") return false;
  if (value.severity !== undefined && (typeof value.severity !== "string" || !SEVERITIES.has(value.severity))) {
    return false;
  }
  return true;
}

function validReturnValue(value: unknown, expected: FunctionReturnType): boolean {
  if (expected === "void") return value === undefined;
  if (!isJsonSafe(value)) return false;
  switch (expected) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return isPlainObject(value);
    case "validationResult":
      return isValidationResultValue(value);
    case "any":
      return true;
  }
}

function argumentError(catalogId: string, functionName: string, message: string, cause?: DataContextError): InternalResult<never> {
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

function expressionError(catalogId: string, functionName: string, message: string): { ok: false; error: FunctionEvaluationError } {
  return { ok: false, error: { code: "EXPRESSION_ERROR", message, catalogId, functionName } };
}

/** The frame of a call nested in the arguments or the body of another call. Nested calls are renderer calls and inherit the scope. */
function nestedFrame(frame: EvaluationFrame): EvaluationFrame {
  return {
    depth: frame.depth + 1,
    actionRoot: false,
    userActivation: false,
    caller: "renderer",
    ...(frame.scope === undefined ? {} : { scope: frame.scope }),
  };
}

/** Executes catalog-declared functions using host-registered implementations, and routes the rest to the agent when a router is configured. */
export class FunctionEvaluator {
  readonly #catalogs: CatalogRegistry;
  readonly #functions: FunctionRegistry;
  readonly #maxDepth: number;
  readonly #router: AgentFunctionRouter | undefined;

  constructor(catalogs: CatalogRegistry, functions: FunctionRegistry, options: FunctionEvaluatorOptions = {}) {
    this.#catalogs = catalogs;
    this.#functions = functions;
    this.#maxDepth =
      Number.isSafeInteger(options.maxDepth) && (options.maxDepth ?? 0) > 0 ? options.maxDepth! : MAX_DEFAULT_DEPTH;
    this.#router = options.agentRouter;
  }

  /**
   * Evaluates a passive DynamicValue: a property binding, a check condition, or a nested argument. A
   * scope lets a call to an agent function route; without one such a call fails locally.
   */
  evaluate(
    catalogId: string,
    functionCall: unknown,
    dataContext: DataContext,
    scope?: AgentFunctionScope,
  ): FunctionEvaluationResult {
    return this.#evaluate(catalogId, functionCall, dataContext, {
      ...PASSIVE_FRAME,
      ...(scope === undefined ? {} : { scope }),
    });
  }

  /**
   * Executes a direct local-action root. Activation-gated functions run only when
   * the caller reports an explicit user gesture; nested calls never inherit it.
   */
  evaluateAction(
    catalogId: string,
    functionCall: unknown,
    dataContext: DataContext,
    options: { userActivation: boolean; scope?: AgentFunctionScope },
  ): FunctionEvaluationResult {
    return this.#evaluate(catalogId, functionCall, dataContext, {
      depth: 0,
      actionRoot: true,
      userActivation: options.userActivation === true,
      caller: "renderer",
      ...(options.scope === undefined ? {} : { scope: options.scope }),
    });
  }

  /**
   * Executes the root call of an agent-initiated callRendererFunction. Refusals
   * that depend on the caller are checked first, in this order: rendererOnly,
   * then requiresUserActivation (an agent call never carries a user gesture).
   * The remaining checks, argument validation and execution are the same code as
   * a renderer call. Action-effect implementations therefore cannot run here,
   * because an agent call is not a local-action root.
   *
   * Nested calls inside the arguments are ordinary renderer expressions. Their
   * own catalogId values are not changed or widened by this method. A nested
   * catalogId that differs from the call's catalogId still fails with
   * UNSUPPORTED_FEATURE, as in every other evaluation.
   *
   * Implementations are synchronous. A host implementation that returns a
   * Promise fails the return-type check.
   */
  evaluateAgentCall(
    catalogId: string,
    functionCall: Pick<FunctionCall, "@call" | "args">,
    dataContext: DataContext,
  ): FunctionEvaluationResult {
    const name = functionCall["@call"];
    // @index is the reserved system function. It is never a catalog function, so it is handled in #evaluate.
    if (name !== INDEX_FUNCTION) {
      const definition = this.#catalogs.getFunctionDefinition(catalogId, name);
      if (!definition.ok) return { ok: false, error: definition.error };
      if (definition.value.allowedCallers === "rendererOnly") {
        return {
          ok: false,
          error: {
            code: "FUNCTION_CALLER_NOT_ALLOWED",
            message: `Function '${name}' cannot be called by agent (allowedCallers is rendererOnly).`,
            catalogId,
            functionName: name,
          },
        };
      }
      // Defensive: the registry allows requiresUserActivation only with rendererOnly, so the check above already refused it.
      if (definition.value.requiresUserActivation) {
        return {
          ok: false,
          error: {
            code: "FUNCTION_CALLER_NOT_ALLOWED",
            message: `Function '${name}' requires user activation context to execute.`,
            catalogId,
            functionName: name,
          },
        };
      }
    }
    return this.#evaluate(catalogId, functionCall, dataContext, {
      depth: 0,
      actionRoot: false,
      userActivation: false,
      caller: "agent",
    });
  }

  #evaluate(catalogId: string, functionCall: unknown, dataContext: DataContext, frame: EvaluationFrame): FunctionEvaluationResult {
    if (isPlainObject(functionCall) && functionCall["@call"] === INDEX_FUNCTION) {
      return this.#evaluateIndex(catalogId, functionCall, dataContext, frame);
    }

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
    if (!validation.ok) return this.#validationFailure(catalogId, functionCall, validation.error, frame);
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
    const functionName = call["@call"];

    if (call.catalogId !== undefined && call.catalogId !== catalogId) {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_FEATURE",
          message: `FunctionCall catalogId "${call.catalogId}" differs from the surface catalog; multi-catalog functions are not yet supported`,
          catalogId,
          functionName,
        },
      };
    }
    if (frame.depth >= this.#maxDepth) {
      return {
        ok: false,
        error: {
          code: "FUNCTION_MAX_DEPTH_EXCEEDED",
          message: `Function nesting exceeds the Weaver limit of ${this.#maxDepth}`,
          catalogId,
          functionName,
        },
      };
    }

    const definitionResult = this.#catalogs.getFunctionDefinition(catalogId, functionName);
    if (!definitionResult.ok) return { ok: false, error: definitionResult.error };
    const definition = definitionResult.value;

    // A renderer binding or action refuses an agentOnly function. The agent may call it with callRendererFunction.
    if (frame.caller === "renderer" && definition.allowedCallers === "agentOnly") {
      return expressionError(
        catalogId,
        functionName,
        `${functionName} is agentOnly and cannot be bound to properties or run from renderer actions`,
      );
    }
    if (definition.requiresUserActivation && !(frame.actionRoot && frame.userActivation)) {
      return expressionError(catalogId, functionName, `${functionName} requires an active user gesture and cannot run from a passive binding`);
    }

    const registration = this.#functions.getRegistration(catalogId, functionName);
    // An agent-initiated root never routes, so a function without an implementation is simply not available.
    if (registration === undefined && frame.caller === "agent") {
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
    if (registration !== undefined && registration.effect === "action" && !frame.actionRoot) {
      return {
        ok: false,
        error: {
          code: "FUNCTION_EFFECT_NOT_ALLOWED",
          message: "Action-effect functions may execute only as a direct local-action root",
          catalogId,
          functionName,
        },
      };
    }

    const args = this.#resolveCallArgs(
      catalogId,
      functionName,
      call.args ?? {},
      (name) => definition.arguments[name] ?? { kind: "literal" },
      dataContext,
      frame,
    );
    if (!args.ok) return args;
    // A pending argument means the call is not run yet. It is never run with an incomplete value.
    if (args.awaiting !== undefined) return { ok: true, value: undefined, awaiting: args.awaiting };

    if (registration === undefined) return this.#route(catalogId, functionName, args.value, frame);

    const resolvedArgs = args.value;
    let result: unknown;
    try {
      const context: FunctionExecutionContext = {
        catalogId,
        dataContext,
        evaluateFunctionCall: (nestedCall) => this.#evaluate(catalogId, nestedCall, dataContext, nestedFrame(frame)),
        propagateFunctionFailure: (error) => {
          throw new RecursiveFunctionFailure(error);
        },
      };
      result = registration.implementation(resolvedArgs, context);
    } catch (cause) {
      if (cause instanceof RecursiveFunctionFailure) return { ok: false, error: cause.error };
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

  /**
   * A call that fails catalog validation. A declared function with no local
   * implementation reports the argument failure as an EXPRESSION_ERROR that names
   * it, because such a call is never run locally.
   */
  #validationFailure(
    catalogId: string,
    functionCall: unknown,
    error: FunctionEvaluationError,
    frame: EvaluationFrame,
  ): FunctionEvaluationResult {
    const name = isPlainObject(functionCall) && typeof functionCall["@call"] === "string" ? functionCall["@call"] : undefined;
    if (
      frame.caller === "renderer" &&
      error.code === "FUNCTION_VALIDATION_FAILED" &&
      name !== undefined &&
      this.#isSchemaOnly(catalogId, name)
    ) {
      return expressionError(catalogId, name, `Validation failed for function '${name}'`);
    }
    return { ok: false, error };
  }

  /** A declared function the catalog describes but the renderer does not implement. */
  #isSchemaOnly(catalogId: string, name: string): boolean {
    return this.#catalogs.hasFunction(catalogId, name) && this.#functions.getRegistration(catalogId, name) === undefined;
  }

  /**
   * Routes a call with no local implementation. A declared function's arguments
   * are validated first. A refused call never reaches the agent, and the failure
   * is local.
   */
  #route(
    catalogId: string,
    functionName: string,
    args: Record<string, unknown>,
    frame: EvaluationFrame,
  ): FunctionEvaluationResult {
    if (this.#router === undefined) {
      return expressionError(
        catalogId,
        functionName,
        `${functionName} has no local implementation, and agent function routing is not enabled`,
      );
    }
    if (frame.scope === undefined) {
      return expressionError(catalogId, functionName, `${functionName} has no local implementation, and no surface is available to route it`);
    }
    if (!isJsonSafe(args)) {
      return expressionError(catalogId, functionName, `Arguments of ${functionName} are not JSON-compatible and were not sent`);
    }

    const validated = this.#catalogs.validateFunctionCall(catalogId, { "@call": functionName, args });
    if (!validated.ok || !isFunctionCall(validated.value)) {
      return expressionError(catalogId, functionName, `Validation failed for function '${functionName}'`);
    }
    // Validation does not apply schema defaults, so the call is sent with them, as the spec requires.
    const routedArgs = this.#catalogs.applyFunctionArgumentDefaults(catalogId, functionName, (validated.value.args ?? {}) as JsonObject);

    const outcome = this.#router.route({ scope: frame.scope, catalogId, functionName, args: routedArgs });
    if (outcome.kind === "value") return { ok: true, value: outcome.value };
    if (outcome.kind === "pending") return { ok: true, value: undefined, awaiting: outcome.functionCallId };
    if (outcome.kind === "failed") {
      return {
        ok: false,
        error: {
          code: "EXPRESSION_ERROR",
          message: outcome.failure.message,
          catalogId,
          functionName,
          functionCallId: outcome.failure.functionCallId,
        },
      };
    }
    return expressionError(catalogId, functionName, `${functionName} was not sent: ${outcome.message}`);
  }

  /**
   * @index returns the innermost collection item index plus an optional offset. It
   * belongs to no catalog, so it is handled before catalog lookup.
   */
  #evaluateIndex(catalogId: string, call: JsonObject, dataContext: DataContext, frame: EvaluationFrame): FunctionEvaluationResult {
    const index = dataContext.collectionIndex;
    if (index === undefined) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_ERROR",
          message: "@index function can only be evaluated inside a collection template iteration scope.",
          catalogId,
          functionName: INDEX_FUNCTION,
        },
      };
    }
    if (Object.keys(call).some((key) => key !== "@call" && key !== "args")) {
      return argumentError(catalogId, INDEX_FUNCTION, "@index FunctionCall has unsupported keys");
    }
    const args = call.args ?? {};
    if (!isPlainObject(args)) return argumentError(catalogId, INDEX_FUNCTION, "@index args must be an object");
    for (const key of Object.keys(args)) {
      if (!INDEX_ARGUMENT_NAMES.has(key)) {
        return argumentError(catalogId, INDEX_FUNCTION, `@index does not accept the argument "${key}"`);
      }
    }

    let offset = 0;
    if (Object.hasOwn(args, "offset")) {
      const resolved = this.#resolveArgument(catalogId, INDEX_FUNCTION, args.offset!, { kind: "dynamicNumber" }, dataContext, frame);
      if (!resolved.ok) return resolved;
      if (resolved.awaiting !== undefined) return { ok: true, value: undefined, awaiting: resolved.awaiting };
      if (typeof resolved.value !== "number" || !Number.isFinite(resolved.value)) {
        return argumentError(catalogId, INDEX_FUNCTION, "@index offset must resolve to a finite number");
      }
      offset = resolved.value;
    }
    return { ok: true, value: index + offset };
  }

  /**
   * Resolves every argument of a call. A pending argument is reported in `awaiting`
   * while the others still resolve, so sibling agent calls are all sent together.
   */
  #resolveCallArgs(
    catalogId: string,
    functionName: string,
    args: JsonObject,
    definitionFor: (name: string) => CatalogFunctionArgumentDefinition,
    dataContext: DataContext,
    frame: EvaluationFrame,
  ): InternalResult<Record<string, unknown>> {
    const resolvedArgs: Record<string, unknown> = {};
    let awaiting: string | undefined;
    for (const [name, value] of Object.entries(args)) {
      const resolved = this.#resolveArgument(catalogId, functionName, value, definitionFor(name), dataContext, frame);
      if (!resolved.ok) return resolved;
      if (resolved.awaiting !== undefined && awaiting === undefined) awaiting = resolved.awaiting;
      resolvedArgs[name] = resolved.value;
    }
    return awaiting === undefined ? { ok: true, value: resolvedArgs } : { ok: true, value: resolvedArgs, awaiting };
  }

  #resolveArgument(
    catalogId: string,
    functionName: string,
    value: JsonValue,
    definition: CatalogFunctionArgumentDefinition,
    dataContext: DataContext,
    frame: EvaluationFrame,
  ): InternalResult<unknown> {
    if (definition.kind === "arrayOfDynamicValues") {
      if (!Array.isArray(value)) return defensiveValue(value, catalogId, functionName);
      const values: unknown[] = [];
      let awaiting: string | undefined;
      // Each item resolves with its declared kind (for example dynamicBoolean, which coerces); default is dynamicValue.
      const itemDefinition: CatalogFunctionArgumentDefinition = definition.items ?? { kind: "dynamicValue" };
      for (const entry of value) {
        const resolved = this.#resolveArgument(catalogId, functionName, entry, itemDefinition, dataContext, frame);
        if (!resolved.ok) return resolved;
        if (resolved.awaiting !== undefined && awaiting === undefined) awaiting = resolved.awaiting;
        values.push(resolved.value);
      }
      return awaiting === undefined ? { ok: true, value: values } : { ok: true, value: values, awaiting };
    }

    if (definition.kind === "literalObject") {
      if (!isPlainObject(value)) return defensiveValue(value, catalogId, functionName);
      const fields: Record<string, unknown> = {};
      let awaiting: string | undefined;
      for (const [name, entry] of Object.entries(value)) {
        const fieldDefinition = definition.properties?.[name];
        const resolved =
          fieldDefinition === undefined
            ? defensiveValue(entry, catalogId, functionName)
            : this.#resolveArgument(catalogId, functionName, entry, fieldDefinition, dataContext, frame);
        if (!resolved.ok) return resolved;
        if (resolved.awaiting !== undefined && awaiting === undefined) awaiting = resolved.awaiting;
        fields[name] = resolved.value;
      }
      return awaiting === undefined ? { ok: true, value: fields } : { ok: true, value: fields, awaiting };
    }

    if (
      definition.kind === "dynamicValue" ||
      definition.kind === "dynamicString" ||
      definition.kind === "dynamicNumber" ||
      definition.kind === "dynamicBoolean" ||
      definition.kind === "dynamicStringList"
    ) {
      const resolved = this.#resolveDynamic(catalogId, functionName, value, definition.kind, dataContext, frame);
      if (!resolved.ok || resolved.awaiting !== undefined || definition.kind !== "dynamicBoolean") return resolved;
      return { ok: true, value: coerceDynamicBoolean(resolved.value) };
    }

    return defensiveValue(value, catalogId, functionName);
  }

  #resolveDynamic(
    catalogId: string,
    functionName: string,
    value: JsonValue,
    kind: DynamicArgumentKind,
    dataContext: DataContext,
    frame: EvaluationFrame,
  ): InternalResult<unknown> {
    if (isDataBinding(value)) {
      const resolved = dataContext.resolveBinding(value);
      if (!resolved.ok) return argumentError(catalogId, functionName, "Data binding could not be resolved", resolved.error);
      return defensiveValue(resolved.value, catalogId, functionName);
    }
    if (isFunctionCall(value)) {
      return this.#evaluate(catalogId, value, dataContext, nestedFrame(frame));
    }
    if (kind === "dynamicValue" && isPlainObject(value)) {
      const unescaped = unescapeLiteralDynamicValue(value);
      if (!unescaped.ok) {
        return {
          ok: false,
          error: {
            code: "INVALID_RESERVED_KEY",
            message: `Reserved key "${unescaped.error.key}" is not allowed in a dynamic object`,
            catalogId,
            functionName,
            key: unescaped.error.key,
            path: unescaped.error.path,
          },
        };
      }
      return { ok: true, value: unescaped.value };
    }
    return defensiveValue(value, catalogId, functionName);
  }
}

import { ActionDispatcher } from "../actions/index.js";
import { CatalogRegistry } from "../catalog/index.js";
import { CheckEvaluator } from "../checks/index.js";
import { cloneJson } from "../data-model/clone.js";
import {
  ComponentInstanceResolver,
  type ResolvedComponentInstance,
} from "../component-instances/index.js";
import { ComponentPropertyResolver } from "../component-properties/index.js";
import { ComponentTreeResolver } from "../component-tree/index.js";
import { FunctionEvaluator, FunctionRegistry } from "../functions/index.js";
import { InputBindingWriter } from "../input-binding/index.js";
import { A2UIMessageProcessor } from "../message-processor/index.js";
import {
  buildA2UIClientCapabilities,
  mapA2UIValidationFailure,
  type A2UIClientCapabilities,
  type A2UIValidationFailureMappingInput,
  type A2UIValidationFailureMappingResult,
} from "../protocol/index.js";
import { SurfaceStore } from "../surfaces/index.js";
import { createResolutionBudget, normalizeResolutionSafety } from "./safety.js";
import type {
  WeaverActionRequest,
  WeaverActionResult,
  WeaverInputRequest,
  WeaverInputResult,
  WeaverRuntimeConfig,
  WeaverRuntimeCreationResult,
  WeaverRuntimeEvent,
  WeaverRuntimeObserver,
  WeaverSurfaceResolutionResult,
  WeaverSurfaceSubscriber,
} from "./types.js";
import type { JsonValue } from "../protocol/index.js";

function cloneRuntimeJson<T>(value: T): T {
  // SAFETY: runtime snapshots cloned here are JSON-shaped protocol values.
  return cloneJson(
    value as unknown as import("../protocol/index.js").JsonValue,
  ) as unknown as T;
}

/**
 * Returns true when the value is JSON-safe: finite numbers, strings, booleans,
 * null, arrays, and plain objects, with no cycles. An undefined member is
 * rejected unless `allowUndefined` is set. Iterative, so deep or cyclic host
 * input cannot exhaust the stack or hang.
 */
function isJsonValue(root: unknown, allowUndefined = false): boolean {
  const stack: { value: unknown; leave: boolean }[] = [
    { value: root, leave: false },
  ];
  const ancestors = new Set<object>();
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.leave) {
      ancestors.delete(frame.value as object);
      continue;
    }
    const value = frame.value;
    if (value === undefined && allowUndefined) continue;
    if (value === null || typeof value === "string" || typeof value === "boolean")
      continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) continue;
      return false;
    }
    if (typeof value !== "object" || ancestors.has(value)) return false;
    const isArray = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!isArray && prototype !== Object.prototype && prototype !== null)
      return false;
    ancestors.add(value);
    stack.push({ value, leave: true });
    const children: unknown[] = isArray
      ? Array.from(value as unknown[])
      : Object.keys(value).map((key) => (value as Record<string, unknown>)[key]);
    for (const child of children) stack.push({ value: child, leave: false });
  }
  return true;
}

/**
 * Copies a caller-supplied value for an observer. The check runs before any copy,
 * whether or not the runtime accepted the value. A value that is not JSON-safe
 * is replaced with the marker, so the copy never walks cyclic or hostile data.
 */
function observedValue(value: unknown): JsonValue {
  if (!isJsonValue(value)) return { unserializable: true };
  return cloneRuntimeJson(value as JsonValue);
}

/**
 * Copies a result that Core built. Core results hold caller data only in the
 * value slots that observedValue handles, so this check is a guard. If it
 * fails, nothing is copied and the build throws, and #observe drops the event.
 */
function observedResult<T>(result: T): T {
  if (!isJsonValue(result, true))
    throw new TypeError("Core result is not JSON-safe");
  return cloneRuntimeJson(result);
}

/** A typed string field of an observed request. A value that is not JSON-safe is delivered as "". */
function observedField(value: string): string {
  return isJsonValue(value) ? value : "";
}

/**
 * The action request copy. A JSON-safe request is copied whole, as before. For
 * any other request only the four typed fields are delivered, each through
 * observedField, so extra fields are never walked.
 */
function observedActionRequest(request: WeaverActionRequest): WeaverActionRequest {
  if (isJsonValue(request)) return cloneRuntimeJson(request);
  return {
    surfaceId: observedField(request.surfaceId),
    sourceComponentId: observedField(request.sourceComponentId),
    scopePath: observedField(request.scopePath),
    actionProperty: observedField(request.actionProperty),
  };
}

/** The input result with its written value replaced by observedValue. */
function observedInputResult(result: WeaverInputResult): WeaverInputResult {
  return result.ok
    ? { ok: true, value: { ...result.value, value: observedValue(result.value.value) } }
    : result;
}

/** The action result with a host local-function value replaced by observedValue. */
function observedActionResult(result: WeaverActionResult): WeaverActionResult {
  if (!result.ok || result.value.kind !== "localFunction") return result;
  const value = result.value.value;
  return {
    ok: true,
    value: {
      kind: "localFunction",
      value: value === undefined ? undefined : observedValue(value),
    },
  };
}

interface RuntimeServices {
  catalogs: CatalogRegistry;
  functions: FunctionRegistry;
  store: SurfaceStore;
  processor: A2UIMessageProcessor;
  trees: ComponentTreeResolver;
  instances: ComponentInstanceResolver;
  properties: ComponentPropertyResolver;
  checks: CheckEvaluator;
  inputs: InputBindingWriter;
  actions: ActionDispatcher;
  safety: import("./safety.js").ResolutionSafetyPolicy;
  observer?: WeaverRuntimeObserver;
}

export class WeaverRuntime {
  readonly #services: RuntimeServices;

  /** @internal Construct runtimes through createWeaverRuntime(). */
  constructor(services: RuntimeServices) {
    this.#services = services;
  }

  /**
   * Delivers an event to the observer. The event is built lazily, so nothing is
   * copied when no observer is configured. Observer exceptions are ignored.
   */
  #observe(build: () => WeaverRuntimeEvent): void {
    const observer = this.#services.observer;
    if (observer === undefined) return;
    try {
      observer(build());
    } catch {
      // An observer must never change runtime results or state.
    }
  }

  process(input: unknown): ReturnType<A2UIMessageProcessor["process"]> {
    const result = this.#services.processor.process(input);
    this.#observe(() => ({
      kind: "message",
      input: observedValue(input),
      result: observedResult(result),
    }));
    return result;
  }

  processMany(
    inputs: readonly unknown[],
  ): ReturnType<A2UIMessageProcessor["process"]>[] {
    return inputs.map((input) => this.process(input));
  }

  getSurface(surfaceId: string) {
    return this.#services.store.get(surfaceId);
  }

  resolveSurface(surfaceId: string): WeaverSurfaceResolutionResult {
    const surface = this.#services.store.get(surfaceId);
    if (surface === undefined)
      return { ok: false, error: { code: "SURFACE_NOT_FOUND", surfaceId } };

    const budget = createResolutionBudget(this.#services.safety);
    const tree = this.#services.trees.resolve(surface, budget);
    if (!tree.ok)
      return {
        ok: false,
        error: { code: "COMPONENT_TREE_RESOLUTION_FAILED", cause: tree.error },
      };
    const instances = this.#services.instances.resolveFromTree(
      surface,
      tree.value,
      budget,
    );
    if (!instances.ok)
      return {
        ok: false,
        error: {
          code: "COMPONENT_INSTANCE_RESOLUTION_FAILED",
          cause: instances.error,
        },
      };
    const hydrated = this.#services.properties.resolveTree(
      surface,
      instances.value,
    );
    if (!hydrated.ok)
      return {
        ok: false,
        error: {
          code: "COMPONENT_PROPERTY_RESOLUTION_FAILED",
          cause: hydrated.error,
        },
      };
    const checks = this.#services.checks.evaluateTree(surface, instances.value);
    if (!checks.ok)
      return {
        ok: false,
        error: { code: "CHECK_EVALUATION_FAILED", cause: checks.error },
      };

    return {
      ok: true,
      value: {
        surfaceId: surface.surfaceId,
        catalogId: surface.catalogId,
        ...(surface.theme === undefined
          ? {}
          : { theme: cloneJson(surface.theme) }),
        sendDataModel: surface.sendDataModel,
        tree: hydrated.value,
        checks: checks.value,
        issues: {
          tree: cloneRuntimeJson(tree.value.issues),
          instances: cloneRuntimeJson(instances.value.issues),
          properties: cloneRuntimeJson(hydrated.value.issues),
        },
      },
    };
  }

  writeInput(request: WeaverInputRequest): WeaverInputResult {
    const result = this.#writeInput(request);
    this.#observe(() => ({
      kind: "input",
      request: {
        surfaceId: observedField(request.surfaceId),
        sourceComponentId: observedField(request.sourceComponentId),
        scopePath: observedField(request.scopePath),
        property: observedField(request.property),
        value: observedValue(request.value),
      },
      result: observedResult(observedInputResult(result)),
    }));
    return result;
  }

  dispatchAction(request: WeaverActionRequest): WeaverActionResult {
    const result = this.#dispatchAction(request);
    this.#observe(() => ({
      kind: "action",
      request: observedActionRequest(request),
      result: observedResult(observedActionResult(result)),
    }));
    return result;
  }

  #writeInput(request: WeaverInputRequest): WeaverInputResult {
    const current = this.#resolveCurrentInstance(request);
    if (!current.ok) return current;
    const written = this.#services.inputs.write({
      surfaceId: request.surfaceId,
      instance: current.value.instance,
      property: request.property,
      value: request.value,
    });
    return written.ok
      ? written
      : {
          ok: false,
          error: { code: "INPUT_WRITE_FAILED", cause: written.error },
        };
  }

  #dispatchAction(request: WeaverActionRequest): WeaverActionResult {
    const current = this.#resolveCurrentInstance(request);
    if (!current.ok) return current;
    const dispatched = this.#services.actions.dispatch({
      surface: current.value.surface,
      instance: current.value.instance,
      actionProperty: request.actionProperty,
    });
    return dispatched.ok
      ? dispatched
      : {
          ok: false,
          error: { code: "ACTION_DISPATCH_FAILED", cause: dispatched.error },
        };
  }

  subscribeSurface(surfaceId: string, subscriber: WeaverSurfaceSubscriber) {
    return this.#services.store.subscribe(surfaceId, () =>
      subscriber(this.resolveSurface(surfaceId)),
    );
  }

  getClientCapabilities(): A2UIClientCapabilities {
    return buildA2UIClientCapabilities({
      supportedCatalogIds: this.#services.catalogs.getSupportedCatalogIds(),
    });
  }

  mapProcessFailureToValidationMessage(
    input: A2UIValidationFailureMappingInput,
  ): A2UIValidationFailureMappingResult {
    return mapA2UIValidationFailure(input);
  }

  #resolveCurrentInstance(identity: {
    surfaceId: string;
    sourceComponentId: string;
    scopePath: string;
  }):
    | {
        ok: true;
        value: {
          surface: NonNullable<ReturnType<SurfaceStore["get"]>>;
          instance: ResolvedComponentInstance;
        };
      }
    | { ok: false; error: import("./types.js").WeaverRuntimeInteractionError } {
    const surface = this.#services.store.get(identity.surfaceId);
    if (surface === undefined)
      return {
        ok: false,
        error: { code: "SURFACE_NOT_FOUND", surfaceId: identity.surfaceId },
      };
    const instances = this.#services.instances.resolve(
      surface,
      createResolutionBudget(this.#services.safety),
    );
    if (!instances.ok)
      return {
        ok: false,
        error: { code: "INSTANCE_RESOLUTION_FAILED", cause: instances.error },
      };
    const instance =
      instances.value.root === undefined
        ? undefined
        : findInstance(
            instances.value.root,
            identity.sourceComponentId,
            identity.scopePath,
          );
    if (instance === undefined) {
      return {
        ok: false,
        error: {
          code: "INSTANCE_NOT_FOUND",
          surfaceId: identity.surfaceId,
          sourceComponentId: identity.sourceComponentId,
          scopePath: identity.scopePath,
        },
      };
    }
    return { ok: true, value: { surface, instance } };
  }
}

function findInstance(
  root: ResolvedComponentInstance,
  sourceComponentId: string,
  scopePath: string,
): ResolvedComponentInstance | undefined {
  if (
    root.sourceComponentId === sourceComponentId &&
    root.scopePath === scopePath
  )
    return root;
  for (const relationship of root.relationships) {
    const children =
      relationship.kind === "single"
        ? relationship.child === undefined
          ? []
          : [relationship.child]
        : relationship.children;
    for (const child of children) {
      const found = findInstance(child, sourceComponentId, scopePath);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function createWeaverRuntime(
  config: WeaverRuntimeConfig = { catalogs: [] },
): WeaverRuntimeCreationResult {
  const safety = normalizeResolutionSafety(config.safety);
  if (!safety.ok)
    return {
      ok: false,
      error: { code: "SAFETY_CONFIGURATION_FAILED", safetyError: safety.error },
    };

  const catalogs = new CatalogRegistry();
  for (const registration of config.catalogs) {
    const result = catalogs.register(registration);
    if (!result.ok)
      return {
        ok: false,
        error: {
          code: "CATALOG_CONFIGURATION_FAILED",
          catalogError: result.error,
        },
      };
  }

  const functions = new FunctionRegistry(catalogs);
  for (const registration of config.functions ?? []) {
    const result = functions.register(registration);
    if (!result.ok)
      return {
        ok: false,
        error: {
          code: "FUNCTION_CONFIGURATION_FAILED",
          functionError: result.error,
        },
      };
  }

  const store = new SurfaceStore();
  const functionEvaluator = new FunctionEvaluator(catalogs, functions);
  const trees = new ComponentTreeResolver(catalogs);
  const instances = new ComponentInstanceResolver(trees);
  const checks = new CheckEvaluator(catalogs, functionEvaluator);
  return {
    ok: true,
    value: new WeaverRuntime({
      catalogs,
      functions,
      store,
      processor: new A2UIMessageProcessor(store, catalogs),
      trees,
      instances,
      properties: new ComponentPropertyResolver(catalogs, functionEvaluator),
      checks,
      inputs: new InputBindingWriter(store, catalogs),
      actions: new ActionDispatcher(catalogs, functionEvaluator, checks, {
        ...(config.now === undefined ? {} : { now: config.now }),
      }),
      safety: safety.value,
      ...(config.observer === undefined ? {} : { observer: config.observer }),
    }),
  };
}

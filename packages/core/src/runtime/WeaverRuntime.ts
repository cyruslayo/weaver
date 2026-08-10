import { ActionDispatcher } from "../actions/index.js";
import { CatalogRegistry } from "../catalog/index.js";
import { CheckEvaluator } from "../checks/index.js";
import { ComponentInstanceResolver, type ResolvedComponentInstance } from "../component-instances/index.js";
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
import type {
  WeaverActionRequest,
  WeaverActionResult,
  WeaverInputRequest,
  WeaverInputResult,
  WeaverRuntimeConfig,
  WeaverRuntimeCreationResult,
  WeaverSurfaceResolutionResult,
  WeaverSurfaceSubscriber,
} from "./types.js";

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
}

export class WeaverRuntime {
  readonly #services: RuntimeServices;

  /** @internal Construct runtimes through createWeaverRuntime(). */
  constructor(services: RuntimeServices) {
    this.#services = services;
  }

  process(input: unknown): ReturnType<A2UIMessageProcessor["process"]> {
    return this.#services.processor.process(input);
  }

  processMany(inputs: readonly unknown[]): ReturnType<A2UIMessageProcessor["process"]>[] {
    return inputs.map((input) => this.process(input));
  }

  getSurface(surfaceId: string) {
    return this.#services.store.get(surfaceId);
  }

  resolveSurface(surfaceId: string): WeaverSurfaceResolutionResult {
    const surface = this.#services.store.get(surfaceId);
    if (surface === undefined) return { ok: false, error: { code: "SURFACE_NOT_FOUND", surfaceId } };

    const tree = this.#services.trees.resolve(surface);
    if (!tree.ok) return { ok: false, error: { code: "COMPONENT_TREE_RESOLUTION_FAILED", cause: tree.error } };
    const instances = this.#services.instances.resolve(surface);
    if (!instances.ok) return { ok: false, error: { code: "COMPONENT_INSTANCE_RESOLUTION_FAILED", cause: instances.error } };
    const hydrated = this.#services.properties.resolveTree(surface, instances.value);
    if (!hydrated.ok) return { ok: false, error: { code: "COMPONENT_PROPERTY_RESOLUTION_FAILED", cause: hydrated.error } };
    const checks = this.#services.checks.evaluateTree(surface, instances.value);
    if (!checks.ok) return { ok: false, error: { code: "CHECK_EVALUATION_FAILED", cause: checks.error } };

    return {
      ok: true,
      value: {
        surfaceId: surface.surfaceId,
        catalogId: surface.catalogId,
        ...(surface.theme === undefined ? {} : { theme: structuredClone(surface.theme) }),
        sendDataModel: surface.sendDataModel,
        tree: hydrated.value,
        checks: checks.value,
        issues: {
          tree: structuredClone(tree.value.issues),
          instances: structuredClone(instances.value.issues),
          properties: structuredClone(hydrated.value.issues),
        },
      },
    };
  }

  writeInput(request: WeaverInputRequest): WeaverInputResult {
    const current = this.#resolveCurrentInstance(request);
    if (!current.ok) return current;
    const written = this.#services.inputs.write({
      surfaceId: request.surfaceId,
      instance: current.value.instance,
      property: request.property,
      value: request.value,
    });
    return written.ok ? written : { ok: false, error: { code: "INPUT_WRITE_FAILED", cause: written.error } };
  }

  dispatchAction(request: WeaverActionRequest): WeaverActionResult {
    const current = this.#resolveCurrentInstance(request);
    if (!current.ok) return current;
    const dispatched = this.#services.actions.dispatch({
      surface: current.value.surface,
      instance: current.value.instance,
      actionProperty: request.actionProperty,
    });
    return dispatched.ok ? dispatched : { ok: false, error: { code: "ACTION_DISPATCH_FAILED", cause: dispatched.error } };
  }

  subscribeSurface(surfaceId: string, subscriber: WeaverSurfaceSubscriber) {
    return this.#services.store.subscribe(surfaceId, () => subscriber(this.resolveSurface(surfaceId)));
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

  #resolveCurrentInstance(identity: { surfaceId: string; sourceComponentId: string; scopePath: string }):
    | { ok: true; value: { surface: NonNullable<ReturnType<SurfaceStore["get"]>>; instance: ResolvedComponentInstance } }
    | { ok: false; error: import("./types.js").WeaverRuntimeInteractionError } {
    const surface = this.#services.store.get(identity.surfaceId);
    if (surface === undefined) return { ok: false, error: { code: "SURFACE_NOT_FOUND", surfaceId: identity.surfaceId } };
    const instances = this.#services.instances.resolve(surface);
    if (!instances.ok) return { ok: false, error: { code: "INSTANCE_RESOLUTION_FAILED", cause: instances.error } };
    const instance = instances.value.root === undefined ? undefined : findInstance(
      instances.value.root,
      identity.sourceComponentId,
      identity.scopePath,
    );
    if (instance === undefined) {
      return { ok: false, error: {
        code: "INSTANCE_NOT_FOUND",
        surfaceId: identity.surfaceId,
        sourceComponentId: identity.sourceComponentId,
        scopePath: identity.scopePath,
      } };
    }
    return { ok: true, value: { surface, instance } };
  }
}

function findInstance(root: ResolvedComponentInstance, sourceComponentId: string, scopePath: string): ResolvedComponentInstance | undefined {
  if (root.sourceComponentId === sourceComponentId && root.scopePath === scopePath) return root;
  for (const relationship of root.relationships) {
    const children = relationship.kind === "single"
      ? relationship.child === undefined ? [] : [relationship.child]
      : relationship.children;
    for (const child of children) {
      const found = findInstance(child, sourceComponentId, scopePath);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function createWeaverRuntime(config: WeaverRuntimeConfig = { catalogs: [] }): WeaverRuntimeCreationResult {
  const catalogs = new CatalogRegistry();
  for (const registration of config.catalogs) {
    const result = catalogs.register(registration);
    if (!result.ok) return { ok: false, error: { code: "CATALOG_CONFIGURATION_FAILED", catalogError: result.error } };
  }

  const functions = new FunctionRegistry(catalogs);
  for (const registration of config.functions ?? []) {
    const result = functions.register(registration);
    if (!result.ok) return { ok: false, error: { code: "FUNCTION_CONFIGURATION_FAILED", functionError: result.error } };
  }

  const store = new SurfaceStore();
  const functionEvaluator = new FunctionEvaluator(catalogs, functions);
  const trees = new ComponentTreeResolver(catalogs);
  const instances = new ComponentInstanceResolver(trees);
  const checks = new CheckEvaluator(catalogs, functionEvaluator);
  return { ok: true, value: new WeaverRuntime({
    catalogs,
    functions,
    store,
    processor: new A2UIMessageProcessor(store, catalogs),
    trees,
    instances,
    properties: new ComponentPropertyResolver(catalogs, functionEvaluator),
    checks,
    inputs: new InputBindingWriter(store, catalogs),
    actions: new ActionDispatcher(catalogs, functionEvaluator, checks, { ...(config.now === undefined ? {} : { now: config.now }) }),
  }) };
}

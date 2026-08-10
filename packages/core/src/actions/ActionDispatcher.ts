import type { CatalogRegistry } from "../catalog/index.js";
import { CheckEvaluator } from "../checks/index.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, isFunctionCall } from "../functions/index.js";
import type { A2UIClientActionMessage, JsonObject, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import { ActionContextResolver } from "./ActionContextResolver.js";
import type { ActionDispatchInput, ActionDispatcherOptions, ActionDispatchResult, ActionTransportMetadata } from "./types.js";

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson) as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)])) as T;
}

function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function contextFor(surface: SurfaceSnapshot, instance: ResolvedComponentInstance) {
  const root = DataContext.root(surface.dataModel);
  if (instance.scopePath === "/") return { ok: true as const, value: root };
  const index = instance.collectionIndex;
  const separator = instance.scopePath.lastIndexOf("/");
  if (index === undefined || separator < 0 || instance.scopePath.slice(separator + 1) !== String(index)) {
    return { ok: false as const, error: { code: "INVALID_COLLECTION_INDEX" as const, index: index ?? Number.NaN } };
  }
  const collectionPath = instance.scopePath.slice(0, separator) || "/";
  return root.createCollectionItemContext(collectionPath, index);
}

/** Executes one explicit interaction; it owns no transport or mutable surface state. */
export class ActionDispatcher {
  readonly #contextResolver: ActionContextResolver;
  readonly #now: () => Date;

  constructor(
    private readonly catalogs: CatalogRegistry,
    private readonly functionEvaluator: FunctionEvaluator,
    private readonly checkEvaluator: CheckEvaluator,
    options: ActionDispatcherOptions = {},
  ) {
    this.#contextResolver = new ActionContextResolver(catalogs, functionEvaluator);
    this.#now = options.now ?? (() => new Date());
  }

  dispatch({ surface, instance, actionProperty }: ActionDispatchInput): ActionDispatchResult {
    const metadata = this.catalogs.getActionProperties(surface.catalogId, instance.component);
    if (!metadata.ok || !metadata.value.includes(actionProperty)) {
      return { ok: false, error: {
        code: "ACTION_PROPERTY_NOT_ALLOWED", message: "Property is not a catalog-declared Action", actionProperty,
        ...(metadata.ok ? {} : { cause: metadata.error }),
      } };
    }
    if (!Object.hasOwn(instance.definition, actionProperty)) {
      return { ok: false, error: { code: "ACTION_NOT_FOUND", message: "Requested action is absent", actionProperty } };
    }
    const action = instance.definition[actionProperty];
    if (!isPlainObject(action)) {
      return { ok: false, error: { code: "ACTION_INVALID", message: "Action definition is invalid", actionProperty } };
    }

    const dataContext = contextFor(surface, instance);
    if (!dataContext.ok) {
      return { ok: false, error: { code: "ACTION_DATA_CONTEXT_FAILED", message: "Instance data scope could not be reconstructed", cause: dataContext.error } };
    }
    const checks = this.checkEvaluator.evaluate(surface.catalogId, instance, dataContext.value);
    if (!checks.ok) {
      return { ok: false, error: { code: "ACTION_CHECK_EVALUATION_FAILED", message: "Component checks could not be evaluated", cause: checks.error } };
    }
    if (checks.value.status !== "valid") {
      return { ok: false, error: { code: "ACTION_BLOCKED_BY_CHECKS", message: "Only valid components may dispatch actions", checks: structuredClone(checks.value) } };
    }

    const hasFunction = Object.hasOwn(action, "functionCall");
    const hasEvent = Object.hasOwn(action, "event");
    if (hasFunction === hasEvent) {
      return { ok: false, error: { code: "ACTION_INVALID", message: "Action must have exactly one path", actionProperty } };
    }
    if (hasFunction) {
      const call = action.functionCall;
      if (!isFunctionCall(call)) {
        return { ok: false, error: { code: "ACTION_INVALID", message: "Local function action is invalid", actionProperty } };
      }
      const evaluated = this.functionEvaluator.evaluateAction(surface.catalogId, call, dataContext.value);
      if (!evaluated.ok) {
        return { ok: false, error: { code: "LOCAL_FUNCTION_FAILED", message: "Local action function failed", cause: evaluated.error } };
      }
      return { ok: true, value: { kind: "localFunction", value: evaluated.value === undefined ? undefined : cloneJson(evaluated.value) } };
    }

    const event = action.event;
    if (!isPlainObject(event) || typeof event.name !== "string" || !isPlainObject(event.context)) {
      return { ok: false, error: { code: "ACTION_INVALID", message: "Server event action is invalid", actionProperty } };
    }
    const context = this.#contextResolver.resolve(surface.catalogId, event.context, dataContext.value);
    if (!context.ok) return context;
    if (surface.sendDataModel && !isPlainObject(surface.dataModel)) {
      return { ok: false, error: { code: "CLIENT_DATA_MODEL_NOT_OBJECT", message: "Synchronized surface data must be a JSON object" } };
    }
    const message: A2UIClientActionMessage = {
      version: "v0.9.1",
      action: {
        name: event.name,
        surfaceId: surface.surfaceId,
        sourceComponentId: instance.sourceComponentId,
        timestamp: this.#now().toISOString(),
        context: cloneJson(context.value),
      },
    };
    let transportMetadata: ActionTransportMetadata | undefined;
    if (surface.sendDataModel) {
      transportMetadata = { a2uiClientDataModel: {
        version: "v0.9.1",
        surfaces: { [surface.surfaceId]: cloneJson(surface.dataModel as JsonObject) },
      } };
    }
    return { ok: true, value: {
      kind: "serverEvent", message,
      ...(transportMetadata === undefined ? {} : { metadata: transportMetadata }),
    } };
  }
}

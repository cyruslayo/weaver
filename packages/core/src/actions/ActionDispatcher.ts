import type { CatalogRegistry } from "../catalog/index.js";
import { componentCatalogId } from "../catalog/catalogResolution.js";
import { CheckEvaluator } from "../checks/index.js";
import type { ActionCallMemo, AgentFunctionScope } from "../agent-functions/types.js";
import { cloneJson } from "../data-model/clone.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, isDataBinding, isFunctionCall } from "../functions/index.js";
import type {
  A2UIRendererActionMessage,
  JsonObject,
  JsonValue,
} from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import { ActionContextResolver } from "./ActionContextResolver.js";
import type { ActionDispatchError } from "./errors.js";
import type {
  ActionDispatchInput,
  ActionDispatcherOptions,
  ActionDispatchResult,
  ActionTransportMetadata,
} from "./types.js";

function cloneActionJson<T>(value: T): T {
  // SAFETY: action snapshots cloned here are JSON-shaped protocol values.
  return cloneJson(value as unknown as JsonValue) as unknown as T;
}

function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function contextFor(
  surface: SurfaceSnapshot,
  instance: ResolvedComponentInstance,
) {
  const root = DataContext.root(surface.dataModel);
  if (instance.scopePath === "/") return { ok: true as const, value: root };
  const index = instance.collectionIndex;
  const separator = instance.scopePath.lastIndexOf("/");
  if (
    index === undefined ||
    separator < 0 ||
    instance.scopePath.slice(separator + 1) !== String(index)
  ) {
    return {
      ok: false as const,
      error: {
        code: "INVALID_COLLECTION_INDEX" as const,
        index: index ?? Number.NaN,
      },
    };
  }
  const collectionPath = instance.scopePath.slice(0, separator) || "/";
  return root.createCollectionItemContext(collectionPath, index);
}

/**
 * The result of a dispatch that waits on agent calls: the callAgentFunction messages
 * it created since the last report. The memo's outbox is emptied, so each message is
 * reported once.
 */
function agentCallsResult(memo: ActionCallMemo | undefined): ActionDispatchResult {
  return { ok: true, value: { kind: "agentFunctionCalls", messages: memo === undefined ? [] : memo.outbox.splice(0) } };
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
    this.#contextResolver = new ActionContextResolver(
      catalogs,
      functionEvaluator,
    );
    this.#now = options.now ?? (() => new Date());
  }

  dispatch({
    surface,
    instance,
    actionProperty,
    userActivation = false,
    memo,
    continuation,
  }: ActionDispatchInput): ActionDispatchResult {
    // Action properties come from the component's own resolved catalog.
    const componentCatalog = componentCatalogId(instance.definition, surface.catalogId);
    if (componentCatalog === undefined) {
      return {
        ok: false,
        error: {
          code: "CATALOG_RESOLUTION_FAILED",
          message: "Component names no @catalogId, and the surface has no default catalogId",
          sourceComponentId: instance.sourceComponentId,
        },
      };
    }
    const metadata = this.catalogs.getActionProperties(componentCatalog, instance.component);
    if (!metadata.ok || !metadata.value.includes(actionProperty)) {
      return {
        ok: false,
        error: {
          code: "ACTION_PROPERTY_NOT_ALLOWED",
          message: "Property is not a catalog-declared Action",
          actionProperty,
          ...(metadata.ok ? {} : { cause: metadata.error }),
        },
      };
    }
    if (!Object.hasOwn(instance.definition, actionProperty)) {
      return {
        ok: false,
        error: {
          code: "ACTION_NOT_FOUND",
          message: "Requested action is absent",
          actionProperty,
        },
      };
    }
    const action = instance.definition[actionProperty];
    if (!isPlainObject(action)) {
      return {
        ok: false,
        error: {
          code: "ACTION_INVALID",
          message: "Action definition is invalid",
          actionProperty,
        },
      };
    }

    const dataContext = contextFor(surface, instance);
    if (!dataContext.ok) {
      return {
        ok: false,
        error: {
          code: "ACTION_DATA_CONTEXT_FAILED",
          message: "Instance data scope could not be reconstructed",
          cause: dataContext.error,
        },
      };
    }
    // Agent routing is enabled only when the runtime supplies a continuation. Its memo is shared by every run of this action.
    const actionMemo: ActionCallMemo | undefined =
      continuation === undefined ? undefined : (memo ?? { states: new Map(), outbox: [] });
    const actionScope: AgentFunctionScope | undefined =
      actionMemo === undefined || continuation === undefined
        ? undefined
        : { surfaceId: surface.surfaceId, kind: "action", memo: actionMemo, continuation };
    const checks = this.checkEvaluator.evaluate(
      surface.catalogId,
      instance,
      dataContext.value,
      { surfaceId: surface.surfaceId, kind: "reactive" },
    );
    if (!checks.ok) {
      return {
        ok: false,
        error: {
          code: "ACTION_CHECK_EVALUATION_FAILED",
          message: "Component checks could not be evaluated",
          cause: checks.error,
        },
      };
    }
    if (checks.value.status !== "valid") {
      return {
        ok: false,
        error: {
          code: "ACTION_BLOCKED_BY_CHECKS",
          message: "Only valid components may dispatch actions",
          checks: cloneActionJson(checks.value),
        },
      };
    }

    const hasFunction = Object.hasOwn(action, "functionCall");
    const hasEvent = Object.hasOwn(action, "event");
    if (hasFunction === hasEvent) {
      return {
        ok: false,
        error: {
          code: "ACTION_INVALID",
          message: "Action must have exactly one path",
          actionProperty,
        },
      };
    }
    if (hasFunction) {
      const call = action.functionCall;
      if (!isFunctionCall(call)) {
        return {
          ok: false,
          error: {
            code: "ACTION_INVALID",
            message: "Local function action is invalid",
            actionProperty,
          },
        };
      }
      const evaluated = this.functionEvaluator.evaluateAction(
        surface.catalogId,
        call,
        dataContext.value,
        { userActivation, ...(actionScope === undefined ? {} : { scope: actionScope }) },
      );
      if (!evaluated.ok) {
        return {
          ok: false,
          error: {
            code: "LOCAL_FUNCTION_FAILED",
            message: "Local action function failed",
            cause: evaluated.error,
          },
        };
      }
      if (evaluated.awaiting !== undefined) return agentCallsResult(actionMemo);
      return {
        ok: true,
        value: {
          kind: "localFunction",
          value:
            evaluated.value === undefined
              ? undefined
              : cloneJson(evaluated.value),
        },
      };
    }

    const event = action.event;
    if (!isPlainObject(event) || typeof event.name !== "string") {
      return {
        ok: false,
        error: {
          code: "ACTION_INVALID",
          message: "Server event action is invalid",
          actionProperty,
        },
      };
    }
    const eventContext = event.context === undefined ? {} : event.context;
    if (!isPlainObject(eventContext)) {
      return {
        ok: false,
        error: { code: "ACTION_INVALID", message: "Event context must be an object", actionProperty },
      };
    }
    const userMessage = this.#resolveUserMessage(
      surface.catalogId,
      event.userMessage,
      dataContext.value,
      actionProperty,
      actionScope,
    );
    if (!userMessage.ok) return userMessage;
    if (userMessage.awaiting !== undefined) return agentCallsResult(actionMemo);
    const context = this.#contextResolver.resolve(
      surface.catalogId,
      eventContext,
      dataContext.value,
      actionScope,
    );
    if (!context.ok) return context;
    if (context.awaiting !== undefined) return agentCallsResult(actionMemo);
    if (surface.sendDataModel && !isPlainObject(surface.dataModel)) {
      return {
        ok: false,
        error: {
          code: "CLIENT_DATA_MODEL_NOT_OBJECT",
          message: "Synchronized surface data must be a JSON object",
        },
      };
    }
    const message: A2UIRendererActionMessage = {
      version: "1.0",
      action: {
        name: event.name,
        ...(userMessage.value === undefined ? {} : { userMessage: userMessage.value }),
        surfaceId: surface.surfaceId,
        sourceComponentId: instance.sourceComponentId,
        timestamp: this.#now().toISOString(),
        context: cloneJson(context.value),
      },
    };
    let transportMetadata: ActionTransportMetadata | undefined;
    if (surface.sendDataModel) {
      transportMetadata = {
        a2uiRendererDataModel: {
          version: "1.0",
          surfaces: {
            [surface.surfaceId]: cloneJson(surface.dataModel as JsonObject),
          },
        },
      };
    }
    return {
      ok: true,
      value: {
        kind: "serverEvent",
        message,
        ...(transportMetadata === undefined
          ? {}
          : { metadata: transportMetadata }),
      },
    };
  }

  /** userMessage is a DynamicString; an absent value stays absent and a non-string result is invalid. */
  #resolveUserMessage(
    catalogId: string | undefined,
    value: unknown,
    dataModel: DataContext,
    actionProperty: string,
    scope: AgentFunctionScope | undefined,
  ): { ok: true; value: string | undefined; awaiting?: string } | { ok: false; error: ActionDispatchError } {
    if (value === undefined) return { ok: true, value: undefined };
    const invalid = (message: string) => ({
      ok: false as const,
      error: { code: "ACTION_INVALID" as const, message, actionProperty },
    });
    if (typeof value === "string") return { ok: true, value };
    if (isDataBinding(value)) {
      const bound = dataModel.resolveBinding(value);
      if (!bound.ok || typeof bound.value !== "string") return invalid("userMessage must resolve to a string");
      return { ok: true, value: bound.value };
    }
    if (isFunctionCall(value)) {
      const evaluated = this.functionEvaluator.evaluate(catalogId, value, dataModel, scope);
      if (evaluated.ok && evaluated.awaiting !== undefined) return { ok: true, value: undefined, awaiting: evaluated.awaiting };
      if (!evaluated.ok || typeof evaluated.value !== "string") return invalid("userMessage must resolve to a string");
      return { ok: true, value: evaluated.value };
    }
    return invalid("userMessage must be a DynamicString");
  }
}

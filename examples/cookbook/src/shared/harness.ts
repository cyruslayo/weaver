import {
  A2UI_V091_BASIC_CATALOG_ID,
  createA2UIV091Producer,
  createA2UIV091StreamIngestion,
  createBasicCatalogFunctionImplementations,
  type A2UIComponent,
  type A2UIServerMessage,
  type A2UIV091StreamIngestionEvent,
  type BasicRegexMatcher,
  type CatalogRegistration,
  type FunctionRegistration,
  type JsonObject,
  type JsonValue,
  type WeaverRuntime,
} from "@cylayo/weaver-core";
import {
  createBasicWebRuntime,
  type BasicWebRuntime,
  type RendererRegistration,
  type WebRenderError,
  type WebServerEventHandoff,
  type WebSurfaceMount,
} from "@cylayo/weaver-web";

/** Finite budgets for every cookbook screen. They are never disabled or bypassed. */
export const COOKBOOK_SAFETY_BUDGETS = {
  maxResolutionDepth: 16,
  maxResolvedInstances: 64,
} as const;

/**
 * One allowlisted trusted action. `transition` validates the context the Web
 * renderer forwarded and returns the next state, or `undefined` when the
 * context is invalid. The state is then left unchanged.
 */
export interface CookbookAction<TState> {
  readonly transition: (
    state: TState,
    context: JsonObject,
  ) => TState | undefined;
  /**
   * Optional. The exact data-model paths this action emits as `updateDataModel`.
   * When omitted, the whole state is sent at `/`.
   */
  readonly dataUpdates?: (
    previous: TState,
    next: TState,
    context: JsonObject,
  ) => ReadonlyArray<{ path: string; value: JsonValue }>;
}

/** Everything a screen declares. The harness supplies the pipeline around it. */
export interface CookbookScreenDefinition<TState> {
  readonly surfaceId: string;
  readonly attributionName: string;
  readonly initialState: TState;
  readonly components: () => A2UIComponent[];
  /** The only event names that reach the agent. Keys are matched with `Object.hasOwn`. */
  readonly actions: Readonly<Record<string, CookbookAction<TState>>>;
  /** Optional trusted Basic functions and regex matcher for the screen's client checks. When `functions` is set, it replaces the harness default. */
  readonly web?: {
    readonly functions?: readonly FunctionRegistration[];
    readonly regexMatcher?: BasicRegexMatcher;
  };
  /**
   * Optional app-owned catalog for this screen. When it is set, the surface uses
   * this catalog's id, and its renderers are registered next to Basic's. A surface
   * uses exactly one catalog, so the catalog must declare every component the
   * screen uses. When it is omitted, the screen uses the canonical Basic catalog.
   */
  readonly catalog?: CookbookCatalogSetup;
}

/** An app-owned catalog and the trusted renderers that belong to it. */
export interface CookbookCatalogSetup {
  readonly catalog: CatalogRegistration;
  readonly renderers: readonly RendererRegistration[];
}

export type CookbookEventResult =
  | { accepted: true }
  | {
      accepted: false;
      reason: "SURFACE_NOT_ALLOWED" | "EVENT_NOT_ALLOWLISTED" | "INVALID_EVENT_CONTEXT";
    };

export type CookbookActionOutcome =
  | { accepted: true; messages: A2UIServerMessage[] }
  | {
      accepted: false;
      reason: "EVENT_NOT_ALLOWLISTED" | "INVALID_EVENT_CONTEXT";
    };

/** A deterministic, LLM-free agent. It owns the state and creates every A2UI message through the producer. */
export interface CookbookAgent<TState> {
  readonly surfaceId: string;
  getState(): TState;
  start(): A2UIServerMessage[];
  handleAction(name: string, context: JsonObject): CookbookActionOutcome;
}

/** Serializes one producer message as one JSONL frame. */
export function encodeA2UIMessage(message: A2UIServerMessage): string {
  return `${JSON.stringify(message)}\n`;
}

/** In-process JSONL stream into one long-lived Core ingestion. Validation stays owned by Core. */
export interface CookbookStream {
  send(messages: readonly A2UIServerMessage[]): void;
  /**
   * Pushes raw JSONL text into the same ingestion as `send`, and returns its events
   * instead of throwing. A screen uses it to feed bad input on purpose. Frame numbers
   * continue from the frames `send` already applied.
   */
  push(chunk: string): A2UIV091StreamIngestionEvent[];
  finish(): void;
  reset(): void;
}

export function createCookbookStream(runtime: WeaverRuntime): CookbookStream {
  const ingestion = createA2UIV091StreamIngestion({ runtime });

  const apply = (events: ReturnType<typeof ingestion.push>): void => {
    for (const event of events) {
      if (!event.ok) {
        throw new Error(
          `Cookbook stream failed at frame ${event.frame}: ${event.error.code}`,
        );
      }
    }
  };

  return {
    send: (messages) => {
      for (const message of messages)
        apply(ingestion.push(encodeA2UIMessage(message)));
    },
    push: (chunk) => ingestion.push(chunk),
    finish: () => apply(ingestion.finish()),
    reset: () => ingestion.reset(),
  };
}

export function createCookbookAgent<TState>(
  definition: CookbookScreenDefinition<TState>,
  config: { catalogId: string },
): CookbookAgent<TState> {
  const producer = createA2UIV091Producer();
  const surfaceId = definition.surfaceId;
  let state = structuredClone(definition.initialState);

  const dataModel = (): A2UIServerMessage =>
    producer.updateDataModel({
      surfaceId,
      // SAFETY: screen state must be JSON-shaped strings, arrays, numbers, and objects.
      value: state as unknown as JsonObject,
    });

  return {
    surfaceId,
    getState: () => structuredClone(state),
    start: () => [
      producer.createSurface({
        surfaceId,
        catalogId: config.catalogId,
        sendDataModel: true,
      }),
      producer.updateComponents({
        surfaceId,
        components: definition.components(),
      }),
      dataModel(),
    ],
    handleAction: (name, context) => {
      if (!Object.hasOwn(definition.actions, name))
        return { accepted: false, reason: "EVENT_NOT_ALLOWLISTED" };
      const next = definition.actions[name]!.transition(
        structuredClone(state),
        context,
      );
      if (next === undefined)
        return { accepted: false, reason: "INVALID_EVENT_CONTEXT" };
      const action = definition.actions[name]!;
      const previous = state;
      state = next;
      const updates = action.dataUpdates?.(
        structuredClone(previous),
        structuredClone(next),
        context,
      );
      return {
        accepted: true,
        messages:
          updates === undefined
            ? [dataModel()]
            : updates.map(({ path, value }) =>
                producer.updateDataModel({ surfaceId, path, value }),
              ),
      };
    },
  };
}

export interface CookbookScreen<TState> {
  readonly web: BasicWebRuntime;
  readonly agent: CookbookAgent<TState>;
  readonly stream: CookbookStream;
  readonly surfaceId: string;
  readonly mount: WebSurfaceMount;
  readonly rejectedEventNames: readonly string[];
  getState(): TState;
  handleServerEvent(event: WebServerEventHandoff): CookbookEventResult;
}

export interface CookbookMountOptions {
  /** Observes the messages the agent emits in answer to an accepted action. Tests use it to assert on them. */
  readonly onOutbound?: (messages: readonly A2UIServerMessage[]) => void;
  /**
   * Observes a render failure that the surface reports after an update. The previous
   * DOM stays in place when it fires, so the screen can show the error beside it.
   */
  readonly onRenderError?: (error: WebRenderError) => void;
}

/** Wires the full pipeline for one screen and mounts it into `target`. */
export function mountCookbookScreen<TState>(
  target: Element,
  definition: CookbookScreenDefinition<TState>,
  options: CookbookMountOptions = {},
): CookbookScreen<TState> {
  const rejectedEventNames: string[] = [];
  let handoff: (event: WebServerEventHandoff) => CookbookEventResult = () => {
    throw new Error("Cookbook event handler is not ready");
  };

  const created = createBasicWebRuntime({
    runtime: {
      safety: COOKBOOK_SAFETY_BUDGETS,
      // Basic functions (formatNumber, formatCurrency, ...) are opt-in. The harness registers them once by default.
      // A screen that supplies its own list replaces the default, so no name is registered twice.
      functions: definition.web?.functions ?? createBasicCatalogFunctionImplementations({ catalogId: A2UI_V091_BASIC_CATALOG_ID }),
    },
    ...(definition.catalog === undefined
      ? {}
      : {
          additionalCatalogs: [definition.catalog.catalog],
          additionalRenderers: definition.catalog.renderers,
        }),
    ...(definition.web?.regexMatcher === undefined
      ? {}
      : { basic: { regexMatcher: definition.web.regexMatcher } }),
    rendering: {
      attributionProvider: () => ({ displayName: definition.attributionName }),
      onServerEvent: (event) => handoff(event),
    },
  });
  if (!created.ok)
    throw new Error(
      `Cookbook Web runtime configuration failed: ${created.error.code}`,
    );

  const web = created.value;
  // A screen with its own catalog creates its surface under that catalog's id, not the Basic id.
  const agent = createCookbookAgent(definition, {
    catalogId: definition.catalog?.catalog.catalogId ?? web.catalogId,
  });
  const stream = createCookbookStream(web.runtime);

  stream.send(agent.start());
  const mounted = web.mount({
    surfaceId: definition.surfaceId,
    target,
    ...(options.onRenderError === undefined ? {} : { onError: options.onRenderError }),
  });
  if (!mounted.ok)
    throw new Error(`Cookbook mount failed: ${mounted.error.code}`);

  handoff = (event) => {
    const action = event.message.action;
    if (action.surfaceId !== definition.surfaceId)
      return { accepted: false, reason: "SURFACE_NOT_ALLOWED" };
    const outcome = agent.handleAction(action.name, action.context);
    if (!outcome.accepted) {
      if (outcome.reason === "EVENT_NOT_ALLOWLISTED")
        rejectedEventNames.push(action.name);
      return outcome;
    }
    stream.send(outcome.messages);
    options.onOutbound?.(outcome.messages);
    return { accepted: true };
  };

  return {
    web,
    agent,
    stream,
    surfaceId: definition.surfaceId,
    mount: mounted.value,
    get rejectedEventNames() {
      return [...rejectedEventNames];
    },
    getState: () => agent.getState(),
    handleServerEvent: (event) => handoff(event),
  };
}

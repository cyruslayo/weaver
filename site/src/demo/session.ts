/**
 * One scenario running on the real Weaver runtime: a fresh Basic Web runtime, one JSONL ingestion
 * into it, the surface mount and the host's answers. The page's writes reach the app through the
 * runtime observer, and its button presses reach the app through onServerEvent. Every host reply
 * is produced by the agent module and enters the runtime as JSONL, the same way a model's output would.
 */
import {
  createA2UIV091StreamIngestion,
  describeWeaverError,
  type A2UIServerMessage,
  type JsonValue,
  type WeaverRuntime,
  type WeaverRuntimeEvent,
} from "@cylayo/weaver-core";
import { createBasicWebRuntime, describeWebRenderError, type WebServerEventHandoff, type WebSurfaceMount } from "@cylayo/weaver-web";
import { describeReply, producer, type ReplyStats } from "./a2ui.js";
import type { ScenarioDefinition } from "./app/types.js";
import type { ScenarioId } from "./data.js";
import { logEvent, type DemoEvent, type EventKind } from "./model.js";
import { resolveSiteImageUrl } from "./media-policy.js";

/** The page's location, passed in so this module never reads import.meta itself. */
export interface SessionPage {
  readonly pageUrl: string;
  readonly baseUrl: string;
}

export interface ScenarioSession {
  readonly id: ScenarioId;
  readonly surfaceId: string;
  /** The Core runtime behind the surface. The node tests drive it without a DOM. */
  readonly runtime: WeaverRuntime;
  readonly catalogId: string;
  /** The button that completes the scenario, as the app names it. */
  readonly mainAction: string;
  /** The view the surface shows now. */
  readonly view: string;
  /** Newest first, at most EVENT_LIMIT entries. */
  readonly events: readonly DemoEvent[];
  /** Every JSONL line sent so far, in order. */
  readonly sentLines: readonly string[];
  /** What the first reply contained. */
  readonly reply: ReplyStats;
  /** True once the scenario's main action was accepted by the app. */
  readonly mainActionSent: boolean;
  /** Frames the ingestion refused. The host's own replies must keep this at zero. */
  readonly rejectedFrames: number;
  mount(target: Element): boolean;
  unmount(): void;
  dataModel(): JsonValue | null;
  /**
   * Presses a Basic button the way the renderer does: the runtime dispatches the action, and the
   * server event goes to the app. Tests use it to run a flow without a DOM.
   */
  press(sourceComponentId: string, scopePath?: string): boolean;
  /** The entry point onServerEvent uses. Tests send a crafted event through it to check the allowlist. */
  receiveServerEvent(event: WebServerEventHandoff): void;
}

/** Looks a key up only when the record owns it, so inherited names such as "constructor" never match. */
function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Starts one scenario. `onChange` runs after each change to the events, the sent lines or the
 * surface, so the page can redraw its panel.
 */
export function createScenarioSession<S, V extends string>(
  definition: ScenarioDefinition<S, V>,
  page: SessionPage,
  onChange: () => void,
): ScenarioSession {
  let state: S = definition.initial();
  let shownView: V | undefined;
  let events: DemoEvent[] = [];
  const sentLines: string[] = [];
  let rejectedFrames = 0;
  let mainActionSent = false;
  let reply: ReplyStats = { count: 0, operations: [], components: [] };
  let mounted: WebSurfaceMount | undefined;

  const created = createBasicWebRuntime({
    runtime: { observer: (event) => observeRuntime(event) },
    basic: {
      // Media is deny-by-default. Only this site's own images/ files load.
      resourcePolicy: ({ url }) => resolveSiteImageUrl(url, page.pageUrl, page.baseUrl),
    },
    rendering: {
      onServerEvent: (event) => handleServerEvent(event),
    },
  });
  if (!created.ok) throw new Error(`Demo runtime configuration failed: ${created.error.code}`);
  const web = created.value;
  const ingestion = createA2UIV091StreamIngestion({ runtime: web.runtime });
  const surfaceId = definition.surfaceId;

  function record(kind: EventKind, text: string): void {
    events = logEvent(events, kind, text);
  }

  /** Feeds the host's messages through the ingestion as JSONL, one frame per message. */
  function send(messages: readonly A2UIServerMessage[]): void {
    for (const message of messages) {
      const line = JSON.stringify(message);
      sentLines.push(line);
      for (const event of ingestion.push(line + "\n")) {
        if (event.ok) continue;
        rejectedFrames += 1;
        record("Rejected", describeWeaverError(event.error, { frame: event.frame }).summary);
      }
    }
    onChange();
  }

  /**
   * The messages that bring the surface in line with the app state. The data comes first, so a
   * view switch never renders stale numbers. Components are sent only when the view changes.
   */
  function replyFor(): A2UIServerMessage[] {
    const view = definition.view(state);
    const messages: A2UIServerMessage[] = [
      producer.updateDataModel({ surfaceId, value: definition.data(state) }),
    ];
    if (view !== shownView) {
      messages.push(producer.updateComponents({ surfaceId, components: definition.components(view) }));
    }
    shownView = view;
    return messages;
  }

  /** Sends the app's current data again, so the screen shows the app state after a refusal. */
  function resync(): void {
    send(replyFor());
  }

  function unmountSurface(): void {
    mounted?.unmount();
    mounted = undefined;
  }

  function observeRuntime(event: WeaverRuntimeEvent): void {
    if (event.kind === "input") {
      if (!event.result.ok) {
        record("Rejected", `${event.request.property} write refused: ${event.result.error.code}`);
        resync();
        return;
      }
      acceptInput(event.result.value.path, event.result.value.value);
      return;
    }
    if (event.kind === "action" && !event.result.ok) {
      record("Rejected", `${event.request.actionProperty} did not dispatch: ${event.result.error.code}`);
      onChange();
    }
  }

  function acceptInput(path: string, value: JsonValue): void {
    const rule = own(definition.inputs, path);
    if (rule === undefined) {
      record("Rejected", `${path} is not a writable input`);
      resync();
      return;
    }
    record("Input", `${path} = ${JSON.stringify(value)}`);
    const result = rule(state, value);
    if (!result.ok) {
      record("Rejected", `${path}: ${result.reason}`);
      resync();
      return;
    }
    state = result.state;
    send(replyFor());
  }

  function handleServerEvent(event: WebServerEventHandoff): void {
    const action = event.message.action;
    const rule = own(definition.actions, action.name);
    if (action.surfaceId !== surfaceId || rule === undefined) {
      // An unknown name never reaches the app's logic. It is shown as refused and nothing else happens.
      record("Rejected", `${action.name} is not an allowed action`);
      onChange();
      return;
    }
    record("Action", `${action.name} ${JSON.stringify(action.context)}`);
    const result = rule(state, action.context);
    if (!result.ok) {
      record("Rejected", `${action.name}: ${result.reason}`);
      resync();
      return;
    }
    state = result.state;
    if (action.name === definition.mainAction) mainActionSent = true;
    send(replyFor());
  }

  // Start: the surface, then the first view's components and the data.
  const first = [producer.createSurface({ surfaceId, catalogId: web.catalogId }), ...replyFor()];
  reply = describeReply(first);
  send(first);

  return {
    id: definition.id,
    surfaceId,
    runtime: web.runtime,
    catalogId: web.catalogId,
    mainAction: definition.mainAction,
    get view() {
      return shownView ?? "";
    },
    get events() {
      return events;
    },
    get sentLines() {
      return sentLines;
    },
    get reply() {
      return reply;
    },
    get mainActionSent() {
      return mainActionSent;
    },
    get rejectedFrames() {
      return rejectedFrames;
    },
    mount(target) {
      unmountSurface();
      target.replaceChildren();
      const result = web.mount({
        surfaceId,
        target,
        onError: (error) => {
          record("Rejected", "render: " + describeWebRenderError(error).summary);
          onChange();
        },
      });
      if (!result.ok) {
        record("Rejected", "render: " + describeWebRenderError(result.error).summary);
        onChange();
        return false;
      }
      mounted = result.value;
      return true;
    },
    unmount: unmountSurface,
    dataModel() {
      const snapshot = web.runtime.getSurface(surfaceId);
      return snapshot === undefined ? null : snapshot.dataModel;
    },
    receiveServerEvent: handleServerEvent,
    press(sourceComponentId, scopePath = "/") {
      const result = web.runtime.dispatchAction({ surfaceId, sourceComponentId, scopePath, actionProperty: "action" });
      if (!result.ok || result.value.kind !== "serverEvent") return false;
      handleServerEvent({
        message: result.value.message,
        ...(result.value.metadata === undefined ? {} : { metadata: result.value.metadata }),
      });
      return true;
    },
  };
}

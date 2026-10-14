/**
 * The host ("your app") side of the demo. A scenario definition holds the app state, the only
 * writable inputs and the only actions the app accepts, each with its own validation. The agent
 * modules describe the screen; these definitions decide what the app does with what the user did.
 */
import type { A2UIComponent, JsonObject, JsonValue } from "@cylayo/weaver-core";
import type { ScenarioId } from "../data.js";

/** The result of one app transition. A refused transition leaves the state unchanged. */
export type Transition<S> = { ok: true; state: S } | { ok: false; reason: string };

export interface ScenarioDefinition<S, V extends string> {
  readonly id: ScenarioId;
  readonly surfaceId: string;
  /** The button that completes the scenario. The side panel reports when it reaches the app. */
  readonly mainAction: string;
  readonly initial: () => S;
  readonly view: (state: S) => V;
  readonly components: (view: V) => A2UIComponent[];
  readonly data: (state: S) => JsonObject;
  /**
   * Writable input paths, with the transition each one runs. Keys are matched with `Object.hasOwn`,
   * so only the listed paths reach the app. Any other write is refused.
   */
  readonly inputs: Readonly<Record<string, (state: S, value: JsonValue) => Transition<S>>>;
  /**
   * Allowlisted action names, with the transition each one runs. Keys are matched with
   * `Object.hasOwn`, so a name such as "constructor" is refused.
   */
  readonly actions: Readonly<Record<string, (state: S, context: JsonObject) => Transition<S>>>;
}

export function accept<S>(state: S): Transition<S> {
  return { ok: true, state };
}

export function refuse<S>(reason: string): Transition<S> {
  return { ok: false, reason };
}

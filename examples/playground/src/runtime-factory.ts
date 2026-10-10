import type { WeaverRuntimeObserver } from "@cylayo/weaver-core";
import { createBasicWebRuntime, type WebServerEventHandoff } from "@cylayo/weaver-web";

const iconPaths: Readonly<Record<string, string>> = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  search: "M10 4a6 6 0 1 0 3.7 10.7L19 20l1-1-5.3-5.3A6 6 0 0 0 10 4z",
  check: "m4 12 5 5L20 6l-1.5-1.5L9 14 5.5 10.5z",
  close: "M6 6l12 12m0-12L6 18",
};

export interface InspectorRuntimeOptions {
  /** Receives every message, input and action. Used only when recording a trace. */
  observer?: WeaverRuntimeObserver;
  now?: () => Date;
  /** Receives server events raised by a live surface. The inspector only logs them. */
  onServerEvent?: (event: WebServerEventHandoff) => void;
}

/**
 * The one Basic Web runtime configuration the inspector uses. Recording, replay
 * and the live mount all call this, so a replay is configured like the recording
 * it checks. Core and Web behavior are not changed here.
 */
export function createInspectorWebRuntime(options: InspectorRuntimeOptions = {}) {
  return createBasicWebRuntime({
    runtime: {
      ...(options.observer === undefined ? {} : { observer: options.observer }),
      ...(options.now === undefined ? {} : { now: options.now }),
    },
    basic: {
      iconResolver: ({ name }) => iconPaths[name],
      regexMatcher: ({ value, pattern }) => new RegExp(pattern, "u").test(value),
    },
    rendering: {
      attributionProvider: () => ({ displayName: "Traced Agent" }),
      onServerEvent: options.onServerEvent ?? (() => undefined),
    },
  });
}

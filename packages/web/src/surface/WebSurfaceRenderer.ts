import type {
  ComponentCheckSnapshot,
  HydratedComponentInstance,
  HydratedValue,
  JsonValue,
  WeaverResolvedSurface,
  WeaverRuntime,
} from "@weaver/core";
import type {
  RendererRegistry,
  WebComponentInteractions,
  WebRenderedRelationship,
} from "../renderers/index.js";
import type { WebRenderError } from "./errors.js";
import type {
  WebServerEventHandoff,
  WebSurfaceAttributionProvider,
  WebSurfaceMountOptions,
  WebSurfaceMountResult,
  WebSurfaceRendererConfig,
  WebSurfaceRenderResult,
  WebSurfaceThemeAdapter,
} from "./types.js";

const identityKey = (sourceComponentId: string, scopePath: string): string =>
  JSON.stringify([sourceComponentId, scopePath]);
const controlIdentityKey = (sourceComponentId: string, scopePath: string, localKey: string): string =>
  JSON.stringify([sourceComponentId, scopePath, localKey]);

type SelectionSnapshot = {
  identity: string;
  start?: number;
  end?: number;
  direction?: "forward" | "backward" | "none";
};

/** Framework-free renderer. Task 20 intentionally rebuilds the complete derived subtree. */
export class WebSurfaceRenderer {
  readonly #runtime: WeaverRuntime;
  readonly #renderers: RendererRegistry;
  readonly #themeAdapter?: WebSurfaceThemeAdapter;
  readonly #attributionProvider?: WebSurfaceAttributionProvider;
  readonly #onServerEvent?: (event: WebServerEventHandoff) => void;

  constructor(config: WebSurfaceRendererConfig) {
    this.#runtime = config.runtime;
    this.#renderers = config.renderers;
    this.#themeAdapter = config.themeAdapter;
    this.#attributionProvider = config.attributionProvider;
    this.#onServerEvent = config.onServerEvent;
  }

  mount(options: WebSurfaceMountOptions): WebSurfaceMountResult {
    const document = options.target.ownerDocument;
    const container = document.createElement("div");
    container.setAttribute("data-weaver-mount", "");

    let mounted = true;
    let generation = 0;
    let controlMetadata = new WeakMap<Element, string>();
    let controls = new Map<string, Element>();
    const localState = new Map<string, Map<string, JsonValue>>();
    const appliedThemeProperties = new Set<string>();
    const render = (): WebSurfaceRenderResult => {
      const focus = captureFocus(container, document, controlMetadata);
      const renderGeneration = ++generation;
      const nextControlMetadata = new WeakMap<Element, string>();
      const nextControls = new Map<string, Element>();
      const renderedIdentities = new Set<string>();
      const result = this.#render(
        options.surfaceId,
        container,
        document,
        renderGeneration,
        () => mounted && generation === renderGeneration,
        () => render(),
        localState,
        renderedIdentities,
        nextControlMetadata,
        nextControls,
        appliedThemeProperties,
      );
      if (result.ok) {
        controlMetadata = nextControlMetadata;
        controls = nextControls;
        if (!result.value.ready) localState.clear();
        else for (const identity of localState.keys()) if (!renderedIdentities.has(identity)) localState.delete(identity);
        if (mounted) restoreFocus(focus, controls);
      }
      return result;
    };
    let lastResult: WebSurfaceRenderResult = render();
    if (!lastResult.ok) {
      mounted = false;
      generation++;
      localState.clear();
      return lastResult;
    }

    options.target.append(container);
    const unsubscribe = this.#runtime.subscribeSurface(options.surfaceId, () => {
      if (!mounted) return;
      lastResult = render();
      if (!lastResult.ok && options.onError !== undefined) {
        try { options.onError(lastResult.error); } catch { /* Host callback isolation. */ }
      }
    });

    return {
      ok: true,
      value: {
        refresh: () => {
          if (!mounted) return lastResult;
          lastResult = render();
          return lastResult;
        },
        unmount: () => {
          if (!mounted) return;
          mounted = false;
          generation++;
          localState.clear();
          unsubscribe();
          container.remove();
        },
        getLastResult: () => cloneResult(lastResult),
      },
    };
  }

  #render(
    surfaceId: string,
    container: Element,
    document: Document,
    generation: number,
    isCurrent: () => boolean,
    requestRefresh: () => WebSurfaceRenderResult,
    localState: Map<string, Map<string, JsonValue>>,
    renderedIdentities: Set<string>,
    controlMetadata: WeakMap<Element, string>,
    controls: Map<string, Element>,
    appliedThemeProperties: Set<string>,
  ): WebSurfaceRenderResult {
    const resolved = this.#runtime.resolveSurface(surfaceId);
    if (!resolved.ok) return { ok: false, error: { code: "SURFACE_RESOLUTION_FAILED", cause: resolved.error } };

    const theme = this.#resolveTheme(resolved.value);
    if (!theme.ok) return theme;
    const attribution = this.#resolveAttribution(resolved.value, document);
    if (!attribution.ok) return attribution;

    let renderedNode: Node | undefined;
    const ready = resolved.value.tree.ready && resolved.value.tree.root !== undefined;
    if (ready) {
      const rendered = this.#renderTree(resolved.value, document, generation, isCurrent, requestRefresh, localState, renderedIdentities, controlMetadata, controls);
      if (!rendered.ok) return rendered;
      renderedNode = rendered.value;
    }

    applyThemeProperties(container as HTMLElement, appliedThemeProperties, theme.value);
    container.replaceChildren(...[
      attribution.value,
      renderedNode,
    ].filter((node): node is Node => node !== undefined));
    return { ok: true, value: { ready } };
  }

  #resolveAttribution(
    surface: WeaverResolvedSurface,
    document: Document,
  ): { ok: true; value: HTMLElement | undefined } | { ok: false; error: WebRenderError } {
    if (this.#attributionProvider === undefined) return { ok: true, value: undefined };
    let result: unknown;
    try {
      result = this.#attributionProvider(Object.freeze({
        surfaceId: surface.surfaceId,
        catalogId: surface.catalogId,
        theme: surface.theme === undefined ? undefined : structuredClone(surface.theme),
      }));
    } catch {
      return { ok: false, error: { code: "ATTRIBUTION_PROVIDER_FAILED" } };
    }
    if (result === undefined) return { ok: true, value: undefined };
    if (result === null || typeof result !== "object"
      || typeof (result as { displayName?: unknown }).displayName !== "string"
      || (result as { displayName: string }).displayName.trim() === ""
      || ("iconUrl" in result && typeof (result as { iconUrl?: unknown }).iconUrl !== "string")) {
      return { ok: false, error: { code: "INVALID_VERIFIED_ATTRIBUTION" } };
    }

    const verified = result as { displayName: string; iconUrl?: string };
    const chrome = document.createElement("div");
    chrome.setAttribute("data-weaver-surface-attribution", "");
    chrome.style.display = "flex";
    chrome.style.alignItems = "center";
    chrome.style.gap = "var(--a2ui-space, 8px)";
    chrome.style.marginBottom = "var(--a2ui-space, 8px)";
    if (verified.iconUrl !== undefined) {
      const icon = document.createElement("img");
      icon.alt = "";
      icon.width = 24;
      icon.height = 24;
      icon.style.objectFit = "contain";
      icon.src = verified.iconUrl;
      chrome.append(icon);
    }
    const name = document.createElement("span");
    name.textContent = verified.displayName;
    chrome.append(name);
    return { ok: true, value: chrome };
  }

  #resolveTheme(surface: WeaverResolvedSurface):
    | { ok: true; value: Readonly<Record<string, string>> }
    | { ok: false; error: WebRenderError } {
    if (this.#themeAdapter === undefined) return { ok: true, value: {} };
    try {
      const result = this.#themeAdapter(Object.freeze({
        catalogId: surface.catalogId,
        theme: surface.theme === undefined ? undefined : structuredClone(surface.theme),
      }));
      if (result === null || typeof result !== "object"
        || result.customProperties === null || typeof result.customProperties !== "object"
        || Array.isArray(result.customProperties)) return { ok: false, error: { code: "THEME_ADAPTER_FAILED" } };
      const properties: Record<string, string> = {};
      for (const [name, value] of Object.entries(result.customProperties)) {
        if (!/^--[A-Za-z_][A-Za-z0-9_-]*$/.test(name) || typeof value !== "string") {
          return { ok: false, error: { code: "THEME_ADAPTER_FAILED" } };
        }
        properties[name] = value;
      }
      return { ok: true, value: properties };
    } catch {
      return { ok: false, error: { code: "THEME_ADAPTER_FAILED" } };
    }
  }

  #renderTree(
    surface: WeaverResolvedSurface,
    document: Document,
    generation: number,
    isCurrent: () => boolean,
    requestRefresh: () => WebSurfaceRenderResult,
    localState: Map<string, Map<string, JsonValue>>,
    renderedIdentities: Set<string>,
    controlMetadata: WeakMap<Element, string>,
    controls: Map<string, Element>,
  ): { ok: true; value: Node } | { ok: false; error: WebRenderError } {
    const checks = new Map<string, ComponentCheckSnapshot>();
    for (const snapshot of surface.checks.components) {
      checks.set(identityKey(snapshot.sourceComponentId, snapshot.scopePath), snapshot);
    }
    return this.#renderInstance(surface.surfaceId, surface.catalogId, surface.tree.root!, checks, document, generation, isCurrent, requestRefresh, localState, renderedIdentities, controlMetadata, controls);
  }

  #renderInstance(
    surfaceId: string,
    catalogId: string,
    instance: HydratedComponentInstance,
    checks: ReadonlyMap<string, ComponentCheckSnapshot>,
    document: Document,
    generation: number,
    isCurrent: () => boolean,
    requestRefresh: () => WebSurfaceRenderResult,
    localState: Map<string, Map<string, JsonValue>>,
    renderedIdentities: Set<string>,
    controlMetadata: WeakMap<Element, string>,
    controls: Map<string, Element>,
  ): { ok: true; value: Node } | { ok: false; error: WebRenderError } {
    const instanceIdentity = identityKey(instance.sourceComponentId, instance.scopePath);
    renderedIdentities.add(instanceIdentity);
    const relationships: WebRenderedRelationship[] = [];
    for (const relationship of instance.relationships) {
      if (relationship.kind === "single") {
        if (relationship.child === undefined) {
          relationships.push({ kind: "single", property: relationship.property,
            location: relationship.location.map((segment) => ({ ...segment })) });
          continue;
        }
        const child = this.#renderInstance(surfaceId, catalogId, relationship.child, checks, document, generation, isCurrent, requestRefresh, localState, renderedIdentities, controlMetadata, controls);
        if (!child.ok) return child;
        relationships.push({
          kind: "single",
          property: relationship.property,
          location: relationship.location.map((segment) => ({ ...segment })),
          child: child.value,
          childComponent: relationship.child.component,
          childProperties: cloneHydratedProperties(relationship.child.properties),
        });
        continue;
      }
      const children: Node[] = [];
      const childComponents: string[] = [];
      const childProperties: Readonly<Record<string, HydratedValue>>[] = [];
      for (const childInstance of relationship.children) {
        const child = this.#renderInstance(surfaceId, catalogId, childInstance, checks, document, generation, isCurrent, requestRefresh, localState, renderedIdentities, controlMetadata, controls);
        if (!child.ok) return child;
        children.push(child.value);
        childComponents.push(childInstance.component);
        childProperties.push(cloneHydratedProperties(childInstance.properties));
      }
      relationships.push({
        kind: relationship.kind,
        property: relationship.property,
        location: relationship.location.map((segment) => ({ ...segment })),
        children,
        childComponents,
        childProperties,
      });
    }

    const renderer = this.#renderers.get(catalogId, instance.component);
    const metadata = { catalogId, component: instance.component, sourceComponentId: instance.sourceComponentId, scopePath: instance.scopePath };
    if (renderer === undefined) return { ok: false, error: { code: "RENDERER_NOT_FOUND", ...metadata } };

    const renderedState = cloneStateEntries(localState.get(instanceIdentity));
    const interactions: WebComponentInteractions = {
      writeInput: (property, value) => {
        if (!isCurrent()) return { ok: false, error: { code: "STALE_RENDER_INTERACTION" } };
        return this.#runtime.writeInput({ surfaceId, sourceComponentId: instance.sourceComponentId, scopePath: instance.scopePath, property, value });
      },
      getLocalState: (key, fallback) => cloneJsonValue(renderedState.get(key) ?? fallback) as typeof fallback,
      setLocalState: (key, value) => {
        if (!isCurrent()) return { ok: false, error: { code: "STALE_RENDER_INTERACTION" } };
        if (!isJsonValue(value)) return { ok: false, error: { code: "INVALID_LOCAL_STATE_VALUE" } };
        let state = localState.get(instanceIdentity);
        if (state === undefined) { state = new Map(); localState.set(instanceIdentity, state); }
        state.set(key, cloneJsonValue(value));
        requestRefresh();
        return { ok: true };
      },
      registerControl: (element, localKey) => {
        const identity = controlIdentityKey(instance.sourceComponentId, instance.scopePath, localKey);
        controlMetadata.set(element, identity);
        controls.set(identity, element);
      },
      dispatchAction: (actionProperty) => {
        if (!isCurrent()) return { ok: false, error: { code: "STALE_RENDER_INTERACTION" } };
        const result = this.#runtime.dispatchAction({ surfaceId, sourceComponentId: instance.sourceComponentId, scopePath: instance.scopePath, actionProperty });
        if (result.ok && result.value.kind === "serverEvent" && this.#onServerEvent !== undefined) {
          try {
            this.#onServerEvent(structuredClone({ message: result.value.message, ...(result.value.metadata === undefined ? {} : { metadata: result.value.metadata }) }));
          } catch { return { ok: false, error: { code: "SERVER_EVENT_HANDOFF_FAILED" } }; }
        }
        return result;
      },
    };

    let node: unknown;
    try {
      node = renderer({ document, catalogId, instance, properties: Object.freeze({ ...instance.properties }), relationships: Object.freeze(relationships), checks: checks.get(instanceIdentity), interactions });
    } catch { return { ok: false, error: { code: "RENDERER_EXECUTION_FAILED", ...metadata } }; }
    if (!isNode(node, document)) return { ok: false, error: { code: "INVALID_RENDERER_RESULT", ...metadata } };
    return { ok: true, value: node };
  }
}

function applyThemeProperties(
  container: HTMLElement,
  applied: Set<string>,
  next: Readonly<Record<string, string>>,
): void {
  for (const name of applied) if (!(name in next)) container.style.removeProperty(name);
  for (const [name, value] of Object.entries(next)) container.style.setProperty(name, value);
  applied.clear();
  for (const name of Object.keys(next)) applied.add(name);
}

function cloneHydratedProperties(
  properties: Readonly<Record<string, HydratedValue>>,
): Readonly<Record<string, HydratedValue>> {
  return structuredClone(properties);
}

function cloneStateEntries(state: ReadonlyMap<string, JsonValue> | undefined): Map<string, JsonValue> {
  const clone = new Map<string, JsonValue>();
  if (state !== undefined) for (const [key, value] of state) clone.set(key, cloneJsonValue(value));
  return clone;
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  return structuredClone(value);
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  let valid: boolean;
  if (Array.isArray(value)) valid = value.every((entry) => isJsonValue(entry, seen));
  else {
    const prototype = Object.getPrototypeOf(value);
    valid = (prototype === Object.prototype || prototype === null)
      && Object.values(value).every((entry) => isJsonValue(entry, seen));
  }
  seen.delete(value);
  return valid;
}

function isNode(value: unknown, document: Document): value is Node {
  const NodeConstructor = document.defaultView?.Node;
  if (NodeConstructor !== undefined) return value instanceof NodeConstructor;
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  const probe = document.createDocumentFragment();
  return Object.getPrototypeOf(probe).isPrototypeOf(value);
}

function captureFocus(container: Element, document: Document, metadata: WeakMap<Element, string>): SelectionSnapshot | undefined {
  const active = document.activeElement;
  if (active === null || !container.contains(active)) return undefined;
  const identity = metadata.get(active);
  if (identity === undefined) return undefined;
  const snapshot: SelectionSnapshot = { identity };
  try {
    const control = active as HTMLInputElement | HTMLTextAreaElement;
    if (typeof control.selectionStart === "number" && typeof control.selectionEnd === "number") {
      snapshot.start = control.selectionStart;
      snapshot.end = control.selectionEnd;
      if (control.selectionDirection !== null) snapshot.direction = control.selectionDirection;
    }
  } catch { /* Some native input types reject selection access. */ }
  return snapshot;
}

function restoreFocus(snapshot: SelectionSnapshot | undefined, controls: ReadonlyMap<string, Element>): void {
  if (snapshot === undefined) return;
  const replacement = controls.get(snapshot.identity);
  if (replacement === undefined || !("focus" in replacement)) return;
  const focusable = replacement as HTMLElement;
  try { focusable.focus({ preventScroll: true }); } catch { return; }
  if (snapshot.start === undefined || snapshot.end === undefined) return;
  try {
    (replacement as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(snapshot.start, snapshot.end, snapshot.direction);
  } catch { /* Selection is unsupported for controls such as date and number inputs. */ }
}

function cloneResult(result: WebSurfaceRenderResult): WebSurfaceRenderResult {
  return result.ok ? { ok: true, value: { ...result.value } } : structuredClone(result);
}

import type {
  ComponentCheckSnapshot,
  HydratedComponentInstance,
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
  WebSurfaceMountOptions,
  WebSurfaceMountResult,
  WebSurfaceRendererConfig,
  WebSurfaceRenderResult,
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
  readonly #onServerEvent?: (event: WebServerEventHandoff) => void;

  constructor(config: WebSurfaceRendererConfig) {
    this.#runtime = config.runtime;
    this.#renderers = config.renderers;
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
    const render = (): WebSurfaceRenderResult => {
      const focus = captureFocus(container, document, controlMetadata);
      const renderGeneration = ++generation;
      const nextControlMetadata = new WeakMap<Element, string>();
      const nextControls = new Map<string, Element>();
      const result = this.#render(
        options.surfaceId,
        container,
        document,
        renderGeneration,
        () => mounted && generation === renderGeneration,
        nextControlMetadata,
        nextControls,
      );
      if (result.ok) {
        controlMetadata = nextControlMetadata;
        controls = nextControls;
        if (mounted) restoreFocus(focus, controls);
      }
      return result;
    };
    let lastResult: WebSurfaceRenderResult = render();
    if (!lastResult.ok) {
      mounted = false;
      generation++;
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
    controlMetadata: WeakMap<Element, string>,
    controls: Map<string, Element>,
  ): WebSurfaceRenderResult {
    const resolved = this.#runtime.resolveSurface(surfaceId);
    if (!resolved.ok) return { ok: false, error: { code: "SURFACE_RESOLUTION_FAILED", cause: resolved.error } };
    if (!resolved.value.tree.ready || resolved.value.tree.root === undefined) {
      container.replaceChildren();
      return { ok: true, value: { ready: false } };
    }

    const rendered = this.#renderTree(resolved.value, document, generation, isCurrent, controlMetadata, controls);
    if (!rendered.ok) return rendered;
    container.replaceChildren(rendered.value);
    return { ok: true, value: { ready: true } };
  }

  #renderTree(
    surface: WeaverResolvedSurface,
    document: Document,
    generation: number,
    isCurrent: () => boolean,
    controlMetadata: WeakMap<Element, string>,
    controls: Map<string, Element>,
  ): { ok: true; value: Node } | { ok: false; error: WebRenderError } {
    const checks = new Map<string, ComponentCheckSnapshot>();
    for (const snapshot of surface.checks.components) {
      checks.set(identityKey(snapshot.sourceComponentId, snapshot.scopePath), snapshot);
    }
    return this.#renderInstance(surface.surfaceId, surface.catalogId, surface.tree.root!, checks, document, generation, isCurrent, controlMetadata, controls);
  }

  #renderInstance(
    surfaceId: string,
    catalogId: string,
    instance: HydratedComponentInstance,
    checks: ReadonlyMap<string, ComponentCheckSnapshot>,
    document: Document,
    generation: number,
    isCurrent: () => boolean,
    controlMetadata: WeakMap<Element, string>,
    controls: Map<string, Element>,
  ): { ok: true; value: Node } | { ok: false; error: WebRenderError } {
    const relationships: WebRenderedRelationship[] = [];
    for (const relationship of instance.relationships) {
      if (relationship.kind === "single") {
        if (relationship.child === undefined) {
          relationships.push({ kind: "single", property: relationship.property });
          continue;
        }
        const child = this.#renderInstance(surfaceId, catalogId, relationship.child, checks, document, generation, isCurrent, controlMetadata, controls);
        if (!child.ok) return child;
        relationships.push({ kind: "single", property: relationship.property, child: child.value });
        continue;
      }
      const children: Node[] = [];
      for (const childInstance of relationship.children) {
        const child = this.#renderInstance(surfaceId, catalogId, childInstance, checks, document, generation, isCurrent, controlMetadata, controls);
        if (!child.ok) return child;
        children.push(child.value);
      }
      relationships.push({ kind: relationship.kind, property: relationship.property, children });
    }

    const renderer = this.#renderers.get(catalogId, instance.component);
    const metadata = {
      catalogId,
      component: instance.component,
      sourceComponentId: instance.sourceComponentId,
      scopePath: instance.scopePath,
    };
    if (renderer === undefined) return { ok: false, error: { code: "RENDERER_NOT_FOUND", ...metadata } };

    const interactions: WebComponentInteractions = {
      writeInput: (property, value) => {
        if (!isCurrent()) return { ok: false, error: { code: "STALE_RENDER_INTERACTION" } };
        return this.#runtime.writeInput({
          surfaceId,
          sourceComponentId: instance.sourceComponentId,
          scopePath: instance.scopePath,
          property,
          value,
        });
      },
      registerControl: (element, localKey) => {
        const identity = controlIdentityKey(instance.sourceComponentId, instance.scopePath, localKey);
        controlMetadata.set(element, identity);
        controls.set(identity, element);
      },
      dispatchAction: (actionProperty) => {
        if (!isCurrent()) return { ok: false, error: { code: "STALE_RENDER_INTERACTION" } };
        const result = this.#runtime.dispatchAction({
          surfaceId,
          sourceComponentId: instance.sourceComponentId,
          scopePath: instance.scopePath,
          actionProperty,
        });
        if (result.ok && result.value.kind === "serverEvent" && this.#onServerEvent !== undefined) {
          try {
            this.#onServerEvent(structuredClone({
              message: result.value.message,
              ...(result.value.metadata === undefined ? {} : { metadata: result.value.metadata }),
            }));
          } catch {
            return { ok: false, error: { code: "SERVER_EVENT_HANDOFF_FAILED" } };
          }
        }
        return result;
      },
    };

    let node: unknown;
    try {
      node = renderer({
        document,
        catalogId,
        instance,
        properties: Object.freeze({ ...instance.properties }),
        relationships: Object.freeze(relationships),
        checks: checks.get(identityKey(instance.sourceComponentId, instance.scopePath)),
        interactions,
      });
    } catch {
      return { ok: false, error: { code: "RENDERER_EXECUTION_FAILED", ...metadata } };
    }
    if (!isNode(node, document)) {
      return { ok: false, error: { code: "INVALID_RENDERER_RESULT", ...metadata } };
    }
    return { ok: true, value: node };
  }
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

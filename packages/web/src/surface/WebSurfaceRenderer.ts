import type {
  ComponentCheckSnapshot,
  HydratedComponentInstance,
  WeaverResolvedSurface,
  WeaverRuntime,
} from "@weaver/core";
import type { RendererRegistry, WebRenderedRelationship } from "../renderers/index.js";
import type { WebRenderError } from "./errors.js";
import type {
  WebSurfaceMountOptions,
  WebSurfaceMountResult,
  WebSurfaceRendererConfig,
  WebSurfaceRenderResult,
} from "./types.js";

const identityKey = (sourceComponentId: string, scopePath: string): string =>
  JSON.stringify([sourceComponentId, scopePath]);

/** Framework-free renderer. Task 20 intentionally rebuilds the complete derived subtree. */
export class WebSurfaceRenderer {
  readonly #runtime: WeaverRuntime;
  readonly #renderers: RendererRegistry;

  constructor(config: WebSurfaceRendererConfig) {
    this.#runtime = config.runtime;
    this.#renderers = config.renderers;
  }

  mount(options: WebSurfaceMountOptions): WebSurfaceMountResult {
    const document = options.target.ownerDocument;
    const container = document.createElement("div");
    container.setAttribute("data-weaver-mount", "");

    let mounted = true;
    let lastResult: WebSurfaceRenderResult = this.#render(options.surfaceId, container, document);
    if (!lastResult.ok) return lastResult;

    options.target.append(container);
    const unsubscribe = this.#runtime.subscribeSurface(options.surfaceId, () => {
      if (!mounted) return;
      lastResult = this.#render(options.surfaceId, container, document);
      if (!lastResult.ok && options.onError !== undefined) {
        try { options.onError(lastResult.error); } catch { /* Host callback isolation. */ }
      }
    });

    return {
      ok: true,
      value: {
        refresh: () => {
          if (!mounted) return lastResult;
          lastResult = this.#render(options.surfaceId, container, document);
          return lastResult;
        },
        unmount: () => {
          if (!mounted) return;
          mounted = false;
          unsubscribe();
          container.remove();
        },
        getLastResult: () => cloneResult(lastResult),
      },
    };
  }

  #render(surfaceId: string, container: Element, document: Document): WebSurfaceRenderResult {
    const resolved = this.#runtime.resolveSurface(surfaceId);
    if (!resolved.ok) return { ok: false, error: { code: "SURFACE_RESOLUTION_FAILED", cause: resolved.error } };
    if (!resolved.value.tree.ready || resolved.value.tree.root === undefined) {
      container.replaceChildren();
      return { ok: true, value: { ready: false } };
    }

    const rendered = this.#renderTree(resolved.value, document);
    if (!rendered.ok) return rendered;
    container.replaceChildren(rendered.value);
    return { ok: true, value: { ready: true } };
  }

  #renderTree(surface: WeaverResolvedSurface, document: Document):
    | { ok: true; value: Node }
    | { ok: false; error: WebRenderError } {
    const checks = new Map<string, ComponentCheckSnapshot>();
    for (const snapshot of surface.checks.components) {
      checks.set(identityKey(snapshot.sourceComponentId, snapshot.scopePath), snapshot);
    }
    return this.#renderInstance(surface.catalogId, surface.tree.root!, checks, document);
  }

  #renderInstance(
    catalogId: string,
    instance: HydratedComponentInstance,
    checks: ReadonlyMap<string, ComponentCheckSnapshot>,
    document: Document,
  ): { ok: true; value: Node } | { ok: false; error: WebRenderError } {
    const relationships: WebRenderedRelationship[] = [];
    for (const relationship of instance.relationships) {
      if (relationship.kind === "single") {
        if (relationship.child === undefined) {
          relationships.push({ kind: "single", property: relationship.property });
          continue;
        }
        const child = this.#renderInstance(catalogId, relationship.child, checks, document);
        if (!child.ok) return child;
        relationships.push({ kind: "single", property: relationship.property, child: child.value });
        continue;
      }
      const children: Node[] = [];
      for (const childInstance of relationship.children) {
        const child = this.#renderInstance(catalogId, childInstance, checks, document);
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

    let node: unknown;
    try {
      node = renderer({
        document,
        catalogId,
        instance,
        properties: Object.freeze({ ...instance.properties }),
        relationships: Object.freeze(relationships),
        checks: checks.get(identityKey(instance.sourceComponentId, instance.scopePath)),
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

function cloneResult(result: WebSurfaceRenderResult): WebSurfaceRenderResult {
  return result.ok ? { ok: true, value: { ...result.value } } : structuredClone(result);
}

import { describeWeaverError, type WeaverErrorDescription } from "@cylayo/weaver-core";
import type { WebInteractionError } from "../renderers/types.js";
import type { WebRenderError } from "./errors.js";

/** Every Web error union that `describeWebRenderError()` accepts. */
export type DescribableWebError = WebRenderError | WebInteractionError;

interface Location {
  surfaceId?: string;
  componentId?: string;
  scopePath?: string;
}

interface RendererLocation extends Location {
  catalogId: string;
  component: string;
  sourceComponentId: string;
  scopePath: string;
}

function describeRendererError(
  code: "RENDERER_NOT_FOUND" | "RENDERER_EXECUTION_FAILED" | "INVALID_RENDERER_RESULT",
  error: RendererLocation,
  summary: string,
  hint: string,
): WeaverErrorDescription {
  return {
    code,
    severity: "error",
    summary: `${summary} Catalog "${error.catalogId}", component "${error.component}", at scope "${error.scopePath}".`,
    componentId: error.sourceComponentId,
    scopePath: error.scopePath,
    causes: [],
    hint,
  };
}

function leaf(code: string, summary: string, hint?: string): WeaverErrorDescription {
  return {
    code,
    severity: "error",
    summary,
    causes: [],
    ...(hint === undefined ? {} : { hint }),
  };
}

/** Wraps a Core description as a child of a Web code, reusing its location when the wrapper has none. */
function wrapCoreDescription(code: string, summary: string, inner: WeaverErrorDescription): WeaverErrorDescription {
  const flat = [inner, ...inner.causes];
  const pick = <K extends keyof Location>(key: K): string | undefined =>
    flat.find((candidate) => candidate[key] !== undefined)?.[key];
  const surfaceId = pick("surfaceId");
  const componentId = pick("componentId");
  const scopePath = pick("scopePath");
  return {
    code,
    severity: "error",
    summary,
    ...(surfaceId === undefined ? {} : { surfaceId }),
    ...(componentId === undefined ? {} : { componentId }),
    ...(scopePath === undefined ? {} : { scopePath }),
    causes: [{ ...inner, causes: [] }, ...inner.causes],
  };
}

/*
 * Each union has its own exhaustive switch. The `default` branch passes the
 * narrowed value to a `never` parameter, so adding a code to either union
 * fails the typecheck until it has a description here.
 */
function describeWebError(error: DescribableWebError): WeaverErrorDescription {
  switch (error.code) {
    case "SURFACE_RESOLUTION_FAILED":
      return wrapCoreDescription(
        "SURFACE_RESOLUTION_FAILED",
        "The surface could not be resolved, so it was not rendered.",
        describeWeaverError(error.cause),
      );
    case "THEME_ADAPTER_FAILED":
      return leaf(
        "THEME_ADAPTER_FAILED",
        "The theme adapter failed or returned an invalid value, so the theme was not applied.",
        "Make the themeAdapter return a plain object of custom properties, and do not throw.",
      );
    case "ATTRIBUTION_PROVIDER_FAILED":
      return leaf(
        "ATTRIBUTION_PROVIDER_FAILED",
        "The attribution provider failed, so no attribution was rendered.",
        "Make the attributionProvider return a result, and do not throw.",
      );
    case "INVALID_VERIFIED_ATTRIBUTION":
      return leaf(
        "INVALID_VERIFIED_ATTRIBUTION",
        "The attribution provider returned an attribution that is not verified, so none was rendered.",
        "Return only attribution that the host has verified, or omit attribution.",
      );
    case "RENDERER_NOT_FOUND":
      return describeRendererError(
        "RENDERER_NOT_FOUND",
        error,
        "No trusted renderer is registered for this component.",
        "Register a trusted renderer for this catalog/component.",
      );
    case "RENDERER_EXECUTION_FAILED":
      return describeRendererError(
        "RENDERER_EXECUTION_FAILED",
        error,
        "The renderer for this component threw while rendering.",
        "Check the renderer for this catalog and component.",
      );
    case "INVALID_RENDERER_RESULT":
      return describeRendererError(
        "INVALID_RENDERER_RESULT",
        error,
        "The renderer for this component did not return a DOM node.",
        "Make the renderer return a Node created from the document it receives.",
      );
    case "STALE_RENDER_INTERACTION":
      return leaf(
        "STALE_RENDER_INTERACTION",
        "The interaction came from a render that has since been replaced, so it was ignored.",
        "Use the latest rendered surface for this interaction.",
      );
    case "SERVER_EVENT_HANDOFF_FAILED":
      return leaf(
        "SERVER_EVENT_HANDOFF_FAILED",
        "The server event could not be handed to the host's onServerEvent handler.",
        "Check the onServerEvent handler passed to WebSurfaceRenderer.",
      );
    default:
      return unknownWebError(error);
  }
}

/*
 * Reached only when a value arrives from JavaScript with a code this version
 * does not know. The `never` parameter makes the typecheck fail instead when a
 * code is added to a union and left undescribed.
 */
function unknownWebError(value: never): WeaverErrorDescription {
  const label = String((value as { code?: unknown }).code ?? "UNKNOWN");
  return leaf(
    label,
    `Weaver reported an error this version cannot describe (code ${label}).`,
    "Update @cylayo/weaver-web so the error can be described, or report the code.",
  );
}

/**
 * Turns a Web render or interaction error into a description a host can show
 * or log. It returns the same shape as Core's `describeWeaverError()`. A
 * surface-resolution failure keeps Core's full cause chain under it. The
 * function is pure: it does no I/O and no DOM work.
 */
export function describeWebRenderError(error: DescribableWebError): WeaverErrorDescription {
  return describeWebError(error);
}

import type { WebComponentRenderer } from "../renderers/index.js";
import { applyBasicMargin } from "./styles.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export interface BasicIconRequest {
  name: string;
}

/** Trusted synchronous host mapping from a catalog-approved icon name to SVG path data. */
export type BasicIconResolver = (request: Readonly<BasicIconRequest>) => string | undefined;

function createSvg(document: Document, svgPath: string | undefined): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-a2ui-component", "Icon");
  applyBasicMargin(svg);
  if (svgPath === undefined) {
    svg.setAttribute("data-a2ui-icon-state", "unresolved");
    return svg;
  }
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", svgPath);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

export function createBasicIconRenderer(resolver?: BasicIconResolver): WebComponentRenderer {
  return ({ document, properties }) => {
    const name = properties.name;
    if (typeof name === "string") return createSvg(document, resolver?.({ name }));
    if (name !== null && typeof name === "object" && !Array.isArray(name) &&
      typeof name.svgPath === "string") return createSvg(document, name.svgPath);
    return createSvg(document, undefined);
  };
}

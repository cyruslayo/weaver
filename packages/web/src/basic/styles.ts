export const basicSpace = "var(--a2ui-space, 8px)";
export const basicRadius = "var(--a2ui-radius, 8px)";
export const basicOutline = "var(--a2ui-color-outline, rgba(0, 0, 0, 0.22))";
export const basicControl = "var(--a2ui-color-control, rgba(127, 127, 127, 0.10))";
export const basicCardShadow = "var(--a2ui-card-shadow, 0 1px 3px rgba(0, 0, 0, 0.12))";

/** Preserve host custom-property expressions even in lightweight DOM implementations. */
export function appendBasicStyle(element: HTMLElement | SVGElement, declarations: string): void {
  const existing = element.getAttribute("style");
  element.setAttribute("style", `${existing === null || existing.trim() === "" ? "" : `${existing.trim().replace(/;?$/, ";")} `}${declarations}`);
}

export function applyBasicMargin(element: HTMLElement | SVGElement): void {
  appendBasicStyle(element, `margin: ${basicSpace}`);
}

export function applyControlShape(element: HTMLElement): void {
  appendBasicStyle(element, `border: 1px solid ${basicOutline}; border-radius: ${basicRadius}`);
}

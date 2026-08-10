import type { WebRenderedRelationship } from "../renderers/index.js";

export function applyBasicHook(element: Element, component: string): void {
  element.setAttribute("data-a2ui-component", component);
}

export function mapJustify(value: unknown): string {
  switch (value) {
    case "center": return "center";
    case "end": return "flex-end";
    case "spaceBetween": return "space-between";
    case "spaceAround": return "space-around";
    case "spaceEvenly": return "space-evenly";
    case "stretch": return "flex-start";
    case "start":
    default: return "flex-start";
  }
}

export function mapAlign(value: unknown): string {
  switch (value) {
    case "center": return "center";
    case "end": return "flex-end";
    case "start": return "flex-start";
    case "stretch":
    default: return "stretch";
  }
}

export function relationshipChildren(
  relationships: readonly WebRenderedRelationship[],
  property: string,
): readonly Node[] {
  const relationship = relationships.find((candidate) => candidate.property === property);
  if (relationship === undefined) return [];
  return relationship.kind === "single"
    ? (relationship.child === undefined ? [] : [relationship.child])
    : relationship.children;
}

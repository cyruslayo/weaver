import type { WebComponentRenderer } from "../renderers/index.js";
import { applyBasicHook, mapAlign, mapJustify, relationshipChildren } from "./layout.js";

const textElements = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  caption: "small",
  body: "p",
} as const;

export const renderText: WebComponentRenderer = ({ document, properties }) => {
  const variant = typeof properties.variant === "string" && properties.variant in textElements
    ? properties.variant as keyof typeof textElements
    : "body";
  const element = document.createElement(textElements[variant]);
  applyBasicHook(element, "Text");
  if (typeof properties.text === "string") element.textContent = properties.text;
  return element;
};

export const renderDivider: WebComponentRenderer = ({ document, properties }) => {
  if (properties.axis !== "vertical") {
    const element = document.createElement("hr");
    applyBasicHook(element, "Divider");
    return element;
  }
  const element = document.createElement("div");
  applyBasicHook(element, "Divider");
  element.setAttribute("role", "separator");
  element.setAttribute("aria-orientation", "vertical");
  element.style.alignSelf = "stretch";
  element.style.minHeight = "1em";
  element.style.width = "0px";
  element.style.borderInlineStart = "1px solid";
  return element;
};

function renderLayout(direction: "row" | "column", component: "Row" | "Column"): WebComponentRenderer {
  return ({ document, properties, relationships }) => {
    const element = document.createElement("div");
    applyBasicHook(element, component);
    element.style.display = "flex";
    element.style.flexDirection = direction;
    element.style.justifyContent = mapJustify(properties.justify);
    element.style.alignItems = mapAlign(properties.align);
    element.append(...relationshipChildren(relationships, "children"));
    return element;
  };
}

export const renderRow = renderLayout("row", "Row");
export const renderColumn = renderLayout("column", "Column");

export const renderList: WebComponentRenderer = ({ document, properties, relationships }) => {
  const element = document.createElement("div");
  applyBasicHook(element, "List");
  element.setAttribute("role", "list");
  element.style.display = "flex";
  element.style.flexDirection = properties.direction === "horizontal" ? "row" : "column";
  element.style.alignItems = mapAlign(properties.align);
  for (const child of relationshipChildren(relationships, "children")) {
    const item = document.createElement("div");
    item.setAttribute("role", "listitem");
    item.append(child);
    element.append(item);
  }
  return element;
};

export const renderCard: WebComponentRenderer = ({ document, relationships }) => {
  const element = document.createElement("div");
  applyBasicHook(element, "Card");
  element.append(...relationshipChildren(relationships, "child"));
  return element;
};

export const renderButton: WebComponentRenderer = ({ document, properties, relationships, checks, interactions }) => {
  const button = document.createElement("button");
  applyBasicHook(button, "Button");
  button.type = "button";
  const variant = properties.variant === "primary" || properties.variant === "borderless"
    ? properties.variant
    : "default";
  button.setAttribute("data-a2ui-variant", variant);
  const children = relationshipChildren(relationships, "child");
  button.append(...children);
  button.disabled = children.length === 0
    || (checks !== undefined && checks.status !== "valid");
  button.addEventListener("click", () => {
    interactions.dispatchAction("action");
  });
  return button;
};

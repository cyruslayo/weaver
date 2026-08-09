import type { WebComponentRenderer, WebRenderedRelationship } from "../renderers/index.js";
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

function tabChildIndex(relationship: WebRenderedRelationship): number | undefined {
  const [tabs, index, child] = relationship.location;
  return relationship.kind === "single"
    && relationship.location.length === 3
    && tabs?.kind === "property" && tabs.name === "tabs"
    && index?.kind === "arrayIndex"
    && child?.kind === "property" && child.name === "child"
    ? index.index
    : undefined;
}

function opaqueId(prefix: "tab" | "tabpanel"): string {
  const nonce = `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  return `weaver-${prefix}-${nonce}`;
}

export const renderTabs: WebComponentRenderer = ({ document, properties, relationships, interactions }) => {
  const container = document.createElement("div");
  applyBasicHook(container, "Tabs");
  const tabs = Array.isArray(properties.tabs) ? properties.tabs : [];
  if (tabs.length === 0) return container;

  const storedIndex = interactions.getLocalState("selectedIndex", 0);
  const selectedIndex = Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < tabs.length ? storedIndex : 0;
  const childByIndex = new Map<number, Node>();
  for (const relationship of relationships) {
    const index = tabChildIndex(relationship);
    if (index !== undefined && relationship.kind === "single" && relationship.child !== undefined) childByIndex.set(index, relationship.child);
  }

  const tablist = document.createElement("div");
  tablist.setAttribute("role", "tablist");
  const panel = document.createElement("div");
  panel.setAttribute("role", "tabpanel");
  const panelId = opaqueId("tabpanel");
  panel.id = panelId;

  tabs.forEach((tab, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.id = opaqueId("tab");
    button.setAttribute("aria-controls", panelId);
    button.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");
    button.tabIndex = index === selectedIndex ? 0 : -1;
    if (typeof tab === "object" && tab !== null && !Array.isArray(tab) && typeof tab.title === "string") button.textContent = tab.title;
    interactions.registerControl(button, `tab:${index}`);
    const select = (nextIndex: number, keyboard: boolean) => {
      if (keyboard) interactions.registerControl(button, `tab:${nextIndex}`);
      else button.focus();
      interactions.setLocalState("selectedIndex", nextIndex);
    };
    button.addEventListener("click", () => select(index, false));
    button.addEventListener("keydown", (event) => {
      let nextIndex: number | undefined;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex === undefined) return;
      event.preventDefault();
      select(nextIndex, true);
    });
    if (index === selectedIndex) panel.setAttribute("aria-labelledby", button.id);
    tablist.append(button);
  });

  const selectedChild = childByIndex.get(selectedIndex);
  if (selectedChild !== undefined) panel.append(selectedChild);
  container.append(tablist, panel);
  return container;
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

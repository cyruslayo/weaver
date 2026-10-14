/**
 * DOM for the agent-app demo. Nodes are built with createElement, createElementNS and textContent
 * only: nothing here uses innerHTML or evaluates text.
 *
 * The surface itself is drawn by the Basic Web renderer into a `.d-surface` element, one per
 * scenario. This module owns the window, the chips, the prompt and the side panel. The panel is
 * redrawn from each session's events and sent lines, so every line it shows is real traffic.
 */
import { SCENARIOS, type ScenarioId } from "./data.js";
import { panelSteps, type DemoEvent } from "./model.js";
import { createScenarioSession, type ScenarioSession } from "./session.js";
import { dinnerDefinition } from "./app/dinner.js";
import { hotelDefinition } from "./app/hotel.js";
import { tripDefinition } from "./app/trip.js";

type Child = Node | string | false | null | undefined;

interface Options {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  /** Boolean attributes such as "disabled" or "checked". */
  flags?: readonly string[];
  focusKey?: string;
  on?: Record<string, (event: Event) => void>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, options: Options = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value);
  for (const name of options.flags ?? []) node.setAttribute(name, "");
  if (options.focusKey) node.dataset.focus = options.focusKey;
  for (const [type, handler] of Object.entries(options.on ?? {})) node.addEventListener(type, handler);
  for (const child of children) {
    if (child === false || child === null || child === undefined) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

const ICON = {
  layers: ["M12 3l9 5-9 5-9-5z", "M3 13l9 5 9-5"],
  send: ["M12 19V5M6 11l6-6 6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
} as const;

/** A decorative inline stroke icon. */
function icon(paths: readonly string[], size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/** The side panel shows this many of the newest JSONL lines. */
const JSONL_LINES_SHOWN = 6;

function chipClass(on: boolean): string {
  return on ? "d-chip is-on" : "d-chip";
}

/**
 * Rebuilds a slot with `build`, and puts keyboard focus back on the element that had it, by its
 * data-focus key, so a redraw never drops the user's place.
 */
function refill(slot: HTMLElement, build: () => Node): void {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && slot.contains(active) ? active.dataset.focus : undefined;
  slot.replaceChildren(build());
  if (key === undefined) return;
  const target = Array.from(slot.querySelectorAll<HTMLElement>("[data-focus]")).find((node) => node.dataset.focus === key);
  target?.focus({ preventScroll: true });
}

function windowBar(panelOpen: boolean, onToggle: () => void): HTMLElement {
  return el(
    "div",
    { className: "d-bar" },
    el("span", { className: "d-dot", attrs: { "aria-hidden": "true" } }),
    el("span", { className: "d-dot", attrs: { "aria-hidden": "true" } }),
    el("span", { className: "d-dot", attrs: { "aria-hidden": "true" } }),
    el("span", { className: "d-appname", text: "Your app" }),
    el("span", { className: "wv-badge wv-badge-muted", text: "rendered by Weaver" }),
    el("span", { className: "d-spacer" }),
    el(
      "button",
      {
        className: chipClass(!panelOpen),
        attrs: { type: "button", "aria-expanded": String(panelOpen), "aria-controls": "d-panel" },
        focusKey: "panel-toggle",
        on: { click: onToggle },
      },
      panelOpen ? "Hide how it works" : "How it works",
    ),
  );
}

function scenarioChips(current: ScenarioId, onPick: (id: ScenarioId) => void): HTMLElement {
  return el(
    "div",
    { className: "d-chips" },
    el("span", { className: "d-chips-label", text: "Try a request" }),
    ...SCENARIOS.map((scenario) => {
      const on = scenario.id === current;
      return el(
        "button",
        {
          className: chipClass(on),
          attrs: { type: "button", "aria-pressed": String(on) },
          focusKey: "scenario-" + scenario.id,
          on: { click: () => onPick(scenario.id) },
        },
        scenario.label,
      );
    }),
  );
}

function agentRow(): HTMLElement {
  return el(
    "div",
    { className: "d-agent" },
    el("span", { className: "d-avatar" }, icon(ICON.layers, 15)),
    el("span", { className: "d-agent-name", text: "Agent" }),
    el("span", { className: "d-agent-note", text: "replied with an interface. Try it." }),
  );
}

function composer(): HTMLElement {
  return el(
    "div",
    { className: "d-composer" },
    el("label", { className: "d-sr", text: "Message your agent", attrs: { for: "d-composer-input" } }),
    el("input", {
      className: "d-composer-input",
      attrs: { id: "d-composer-input", type: "text", placeholder: "Try one of the requests above" },
      flags: ["disabled"],
    }),
    el(
      "button",
      {
        className: "d-send",
        attrs: { type: "button", "aria-label": "Send (not available in this demo)" },
        flags: ["disabled"],
      },
      icon(ICON.send, 16),
    ),
  );
}

function eventRow(event: DemoEvent): HTMLElement {
  const kindClass = event.kind === "Action" ? " d-kind-action" : event.kind === "Rejected" ? " d-kind-rejected" : " d-kind-input";
  return el(
    "div",
    { className: "d-event" },
    el("span", { className: "d-kind" + kindClass, text: event.kind }),
    el("span", { className: "d-mono d-event-text", text: event.text }),
  );
}

/** The panel: the steps, the live events, and the JSONL the host really sent. */
function sidePanel(session: ScenarioSession, a2uiOpen: boolean, onDisclosure: (open: boolean) => void): HTMLElement {
  const steps = panelSteps({
    stats: session.reply,
    action: session.mainAction,
    actionSent: session.mainActionSent,
  }).map((step) =>
    el(
      "li",
      { className: "d-step-item" },
      el("span", { className: "d-step-n", text: String(step.n) }),
      el(
        "span",
        { className: "d-step-text" },
        el("span", { className: "d-step-title", text: step.title }),
        el("span", { className: "d-step-body", text: step.body }),
      ),
    ),
  );

  const events = session.events.length
    ? session.events.map((event) => eventRow(event))
    : [el("p", { className: "d-empty-note", text: "Use the interface. Every change and button press shows up here." })];

  const sent = session.sentLines;
  const shown = sent.slice(-JSONL_LINES_SHOWN);
  const jsonl = shown.length
    ? shown.join("\n")
    : "Nothing sent yet.";

  const details = el(
    "details",
    {
      className: "d-details",
      attrs: a2uiOpen ? { open: "" } : {},
      on: { toggle: (event) => onDisclosure((event.currentTarget as HTMLDetailsElement).open) },
    },
    el(
      "summary",
      { focusKey: "a2ui-summary" },
      el("span", { text: "See the A2UI the agent sent" }),
      icon(ICON.chevronDown, 16),
    ),
    el(
      "figure",
      { className: "wv-code" },
      el(
        "figcaption",
        { className: "wv-code-head" },
        el("span", { text: `JSONL · ${sent.length} ${sent.length === 1 ? "message" : "messages"} sent · latest ${shown.length}` }),
      ),
      el("pre", { className: "d-jsonl" }, el("code", { text: jsonl })),
    ),
  );

  return el(
    "aside",
    { className: "d-panel", attrs: { id: "d-panel", "aria-label": "How Weaver built this" } },
    el("p", { className: "d-panel-title", text: "How Weaver built this" }),
    el("ol", { className: "d-steps" }, ...steps),
    el(
      "div",
      { className: "d-events" },
      el("p", { className: "d-events-title", text: "What your app received" }),
      ...events,
    ),
    details,
  );
}

/** Starts a scenario on its own runtime. Each scenario has its own host definition. */
function createSession(id: ScenarioId, page: { pageUrl: string; baseUrl: string }, onChange: () => void): ScenarioSession {
  switch (id) {
    case "hotel":
      return createScenarioSession(hotelDefinition, page, onChange);
    case "food":
      return createScenarioSession(dinnerDefinition, page, onChange);
    case "trip":
      return createScenarioSession(tripDefinition, page, onChange);
  }
}

export interface MountOptions {
  /** Site base URL with a trailing slash, for example "/" or "/weaver/". */
  baseUrl: string;
}

/**
 * Mounts the demo into root and keeps it in sync with the runtime. Calling this once per page is
 * enough. The demo owns the subtree of root.
 */
export function mountDemo(root: HTMLElement, options: MountOptions): void {
  const page = { pageUrl: window.location.href, baseUrl: options.baseUrl };
  const ui = {
    scenario: "hotel" as ScenarioId,
    panelOpen: !window.matchMedia("(max-width: 760px)").matches,
    a2uiOpen: false,
  };
  const sessions = new Map<ScenarioId, ScenarioSession>();
  let current: ScenarioSession | undefined;

  const barSlot = el("div", { className: "d-bar-slot" });
  const chipsSlot = el("div", { className: "d-slot" });
  const promptSlot = el("div", { className: "d-slot" });
  const surfaceSlot = el("div", { className: "d-slot" });
  const panelSlot = el("div", { className: "d-slot d-panel-slot" });

  function renderBar(): void {
    refill(barSlot, () => windowBar(ui.panelOpen, togglePanel));
  }

  function renderChips(): void {
    refill(chipsSlot, () => scenarioChips(ui.scenario, selectScenario));
  }

  function renderPrompt(): void {
    const scenario = SCENARIOS.find((candidate) => candidate.id === ui.scenario);
    refill(promptSlot, () => el("p", { className: "d-prompt", text: scenario?.prompt ?? "" }));
  }

  function renderPanel(): void {
    refill(panelSlot, () => {
      if (!ui.panelOpen || current === undefined) return el("span");
      return sidePanel(current, ui.a2uiOpen, (open) => {
        ui.a2uiOpen = open;
      });
    });
  }

  /** Tags the surface with the view it shows, so the stylesheet can target a view's photos. */
  function syncSurfaceView(): void {
    const surface = surfaceSlot.querySelector<HTMLElement>(".d-surface");
    if (surface === null || current === undefined) return;
    surface.dataset.view = current.view;
  }

  function togglePanel(): void {
    ui.panelOpen = !ui.panelOpen;
    renderBar();
    renderPanel();
  }

  function selectScenario(id: ScenarioId): void {
    if (current !== undefined && ui.scenario === id) return;
    current?.unmount();
    ui.scenario = id;
    let session = sessions.get(id);
    if (session === undefined) {
      session = createSession(id, page, () => {
        syncSurfaceView();
        renderPanel();
      });
      sessions.set(id, session);
    }
    current = session;
    const surface = el("div", { className: "d-surface", attrs: { "data-theme": "light" } });
    surfaceSlot.replaceChildren(surface);
    session.mount(surface);
    syncSurfaceView();
    renderChips();
    renderPrompt();
    renderPanel();
  }

  const chat = el(
    "div",
    { className: "d-chat" },
    chipsSlot,
    promptSlot,
    agentRow(),
    surfaceSlot,
    composer(),
  );

  root.replaceChildren(
    el(
      "div",
      { className: "d-root" },
      el("div", { className: "d-window" }, barSlot, el("div", { className: "d-body" }, chat, panelSlot)),
      el(
        "p",
        { className: "d-credit" },
        "Sample data. Photos from Unsplash by Yuliya Pankevich, Thomas Peham, David Kuvaev, Dylan Calluy, Marie Dehayes, Jared Rice, Antonio Araujo, Ivan Torres, Ben Lei, Ella Olsson, Mads Eneqvist, BraggsDiner, Magdalena Raczka, Aayush Gupta, Liam McKay, Lukas Bato, Maxence Bouniort and Julia Solonina.",
      ),
    ),
  );

  renderBar();
  selectScenario(ui.scenario);
}

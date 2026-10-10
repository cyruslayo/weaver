import type { WeaverErrorDescription } from "@cylayo/weaver-core";

/**
 * A framework-free diagnostics panel for Weaver error descriptions. It lives in
 * examples/, not in a published package, until an adopting host asks for it.
 *
 * Every piece of text is set with `textContent`. Nothing is parsed as markup, so
 * a description that contains HTML is shown as plain text and creates no element.
 */

export interface DiagnosticsPanelOptions {
  /** The panel's heading. Defaults to "Diagnostics". */
  readonly title?: string;
  /** The heading level of the title. Groups use the levels below it. Defaults to 2. */
  readonly headingLevel?: 2 | 3;
  /** The text shown when there is nothing to list. */
  readonly emptyText?: string;
}

const DEFAULT_TITLE = "Diagnostics";
const DEFAULT_EMPTY_TEXT = "No errors to show.";

interface SurfaceGroup {
  readonly surfaceId: string | undefined;
  /** Component groups in first-seen order. */
  readonly components: Map<string | undefined, WeaverErrorDescription[]>;
}

interface FrameGroup {
  readonly frame: number | undefined;
  /** Surface groups in first-seen order. */
  readonly surfaces: Map<string | undefined, SurfaceGroup>;
}

/**
 * Groups descriptions by frame, then surface, then component. Frames sort in
 * ascending order, with descriptions that have no frame last. Surfaces and
 * components keep the order in which they first appear, and entries keep their
 * input order inside each component.
 */
export function groupDiagnostics(descriptions: readonly WeaverErrorDescription[]): FrameGroup[] {
  const frames = new Map<number | undefined, FrameGroup>();
  for (const description of descriptions) {
    let frame = frames.get(description.frame);
    if (frame === undefined) {
      frame = { frame: description.frame, surfaces: new Map() };
      frames.set(description.frame, frame);
    }
    let surface = frame.surfaces.get(description.surfaceId);
    if (surface === undefined) {
      surface = { surfaceId: description.surfaceId, components: new Map() };
      frame.surfaces.set(description.surfaceId, surface);
    }
    const entries = surface.components.get(description.componentId) ?? [];
    entries.push(description);
    surface.components.set(description.componentId, entries);
  }
  return [...frames.values()].sort((left, right) => {
    if (left.frame === right.frame) return 0;
    if (left.frame === undefined) return 1;
    if (right.frame === undefined) return -1;
    return left.frame - right.frame;
  });
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function heading(doc: Document, level: number, className: string, text: string): HTMLElement {
  // Levels are clamped to h2..h6, so a caller can never produce an invalid heading.
  const clamped = Math.min(Math.max(level, 2), 6);
  return element(doc, `h${clamped}` as "h2", className, text);
}

function countText(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}.`;
}

/** One description as a list item: its code and summary, its location, its hint, and its flattened cause chain. */
function entryElement(doc: Document, description: WeaverErrorDescription): HTMLElement {
  const item = element(doc, "li", "diagnostics-entry");
  item.dataset.code = description.code;

  const summary = element(doc, "p", "diagnostics-summary");
  summary.append(
    element(doc, "strong", "diagnostics-code", description.code),
    doc.createTextNode(` (${description.severity}): ${description.summary}`),
  );
  item.append(summary);

  const locations: Array<[string, string]> = [];
  if (description.scopePath !== undefined) locations.push(["Scope", description.scopePath]);
  if (description.dataPath !== undefined) locations.push(["Data path", description.dataPath]);
  if (locations.length > 0) {
    const fields = element(doc, "dl", "diagnostics-fields");
    for (const [label, value] of locations) {
      fields.append(element(doc, "dt", undefined, label), element(doc, "dd", undefined, value));
    }
    item.append(fields);
  }

  if (description.hint !== undefined) {
    item.append(element(doc, "p", "diagnostics-hint", `Fix: ${description.hint}`));
  }

  if (description.causes.length > 0) {
    item.append(element(doc, "p", "diagnostics-causes-label", "Cause chain, in order:"));
    const causes = element(doc, "ol", "diagnostics-causes");
    for (const cause of description.causes) {
      causes.append(element(doc, "li", undefined, `${cause.code}: ${cause.summary}`));
    }
    item.append(causes);
  }
  return item;
}

/**
 * Replaces the content of `target` with a panel that lists the descriptions. The
 * panel is one focusable region, so it is reachable by keyboard, and it uses
 * headings and lists for its structure.
 */
export function renderDiagnosticsPanel(
  target: HTMLElement,
  descriptions: readonly WeaverErrorDescription[],
  options: DiagnosticsPanelOptions = {},
): void {
  const doc = target.ownerDocument;
  const level = options.headingLevel ?? 2;
  const title = options.title ?? DEFAULT_TITLE;

  const panel = element(doc, "section", "diagnostics-panel");
  panel.tabIndex = 0;
  panel.setAttribute("aria-label", title);
  panel.append(heading(doc, level, "diagnostics-title", title));

  if (descriptions.length === 0) {
    panel.append(element(doc, "p", "diagnostics-empty", options.emptyText ?? DEFAULT_EMPTY_TEXT));
  } else {
    panel.append(element(doc, "p", "diagnostics-count", countText(descriptions.length)));
    for (const frameGroup of groupDiagnostics(descriptions)) {
      const frameSection = element(doc, "section", "diagnostics-frame");
      const frameLabel = frameGroup.frame === undefined ? "No frame number" : `Frame ${frameGroup.frame}`;
      frameSection.append(heading(doc, level + 1, "diagnostics-frame-title", frameLabel));

      for (const surfaceGroup of frameGroup.surfaces.values()) {
        const surfaceSection = element(doc, "section", "diagnostics-surface");
        const surfaceLabel = surfaceGroup.surfaceId === undefined ? "No surface" : `Surface "${surfaceGroup.surfaceId}"`;
        surfaceSection.append(heading(doc, level + 2, "diagnostics-surface-title", surfaceLabel));

        for (const [componentId, entries] of surfaceGroup.components) {
          const componentSection = element(doc, "section", "diagnostics-component");
          const componentLabel = componentId === undefined ? "No component" : `Component "${componentId}"`;
          componentSection.append(heading(doc, level + 3, "diagnostics-component-title", componentLabel));
          const list = element(doc, "ol", "diagnostics-entries");
          for (const entry of entries) list.append(entryElement(doc, entry));
          componentSection.append(list);
          surfaceSection.append(componentSection);
        }
        frameSection.append(surfaceSection);
      }
      panel.append(frameSection);
    }
  }
  target.replaceChildren(panel);
}

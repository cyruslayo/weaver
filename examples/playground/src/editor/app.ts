import "./weaver-tokens.css";
import "./editor.css";
import "@weaver/shared/diagnostics-panel.css";
import { renderDiagnosticsPanel } from "@weaver/shared";
import {
  WEAVER_CORE_VERSION,
  createBasicCatalogV091Registration,
  generateA2UIV091Prompt,
  type WeaverErrorDescription,
  type WeaverRuntimeEvent,
} from "@cylayo/weaver-core";
import type { WebServerEventHandoff } from "@cylayo/weaver-web";
import {
  DEFAULT_EXAMPLE_ID,
  PLAYGROUND_EXAMPLES,
  PLAYGROUND_SURFACE_ID,
  findExample,
} from "./examples.js";
import { createCodeSnippet } from "./code-snippet.js";
import { PlaygroundSession, type SessionHooks, type SessionPage } from "./session.js";
import { decodeSharedJsonl, describeShareDecodeFailure, encodeSharedJsonl } from "./share.js";

/** Debounce for the editor. Each pause in typing rebuilds the preview once. */
const REBUILD_DELAY_MS = 300;
/** The stream replays one line per this many milliseconds, at 1x speed. */
const STREAM_LINE_DELAY_MS = 600;
const SPEEDS = [0.5, 1, 2] as const;
const MAX_EVENTS = 50;
const MAX_DETAIL_CHARACTERS = 160;
const NOTE_MILLISECONDS = 1500;

const page: SessionPage = {
  pageUrl: window.location.href,
  baseUrl: import.meta.env.BASE_URL,
};

function byId<T extends Element>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Playground element #${id} was not found`);
  return found as unknown as T;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const ui = {
  versionBadge: byId<HTMLElement>("version-badge"),
  menuToggle: byId<HTMLButtonElement>("menu-toggle"),
  menuIcon: byId<SVGPathElement>("menu-icon"),
  menuSheet: byId<HTMLElement>("menu-sheet"),
  exampleList: byId<HTMLUListElement>("example-list"),
  source: byId<HTMLTextAreaElement>("source"),
  backdrop: byId<HTMLElement>("backdrop"),
  streamButton: byId<HTMLButtonElement>("stream-button"),
  speedButtons: [...document.querySelectorAll<HTMLButtonElement>("button.seg-btn[data-speed]")],
  resetButton: byId<HTMLButtonElement>("reset-button"),
  copyButton: byId<HTMLButtonElement>("copy-button"),
  shareButton: byId<HTMLButtonElement>("share-button"),
  transientNote: byId<HTMLElement>("transient-note"),
  confirmBar: byId<HTMLElement>("confirm-bar"),
  confirmText: byId<HTMLElement>("confirm-text"),
  confirmReplace: byId<HTMLButtonElement>("confirm-replace"),
  confirmKeep: byId<HTMLButtonElement>("confirm-keep"),
  streamStatus: byId<HTMLElement>("stream-status"),
  rejectChip: byId<HTMLElement>("reject-chip"),
  copyStatus: byId<HTMLElement>("copy-status"),
  shareNotice: byId<HTMLElement>("share-notice"),
  fallback: byId<HTMLElement>("fallback"),
  fallbackText: byId<HTMLTextAreaElement>("fallback-text"),
  preview: byId<HTMLElement>("preview"),
  previewEmpty: byId<HTMLElement>("preview-empty"),
  eventList: byId<HTMLOListElement>("event-list"),
  eventEmpty: byId<HTMLElement>("event-empty"),
  dataModel: byId<HTMLElement>("data-model"),
  promptText: byId<HTMLElement>("prompt-text"),
  copyPrompt: byId<HTMLButtonElement>("copy-prompt"),
  errorCount: byId<HTMLElement>("error-count"),
  errorPanel: byId<HTMLElement>("error-panel"),
  tabs: [
    { tab: byId<HTMLButtonElement>("tab-events"), panel: byId<HTMLElement>("panel-events") },
    { tab: byId<HTMLButtonElement>("tab-data"), panel: byId<HTMLElement>("panel-data") },
    { tab: byId<HTMLButtonElement>("tab-prompt"), panel: byId<HTMLElement>("panel-prompt") },
    { tab: byId<HTMLButtonElement>("tab-errors"), panel: byId<HTMLElement>("panel-errors") },
  ],
};

interface PlaygroundEvent {
  readonly id: number;
  readonly kind: "Input" | "Action";
  readonly detail: string;
  readonly status: string;
}

const state = {
  session: undefined as PlaygroundSession | undefined,
  generation: 0,
  /** False until the current session has a mounted surface. */
  mounted: false,
  currentExampleId: undefined as string | undefined,
  /** The editor text the last load or share set. An edit makes the text differ from it. */
  baseline: "",
  pendingExampleId: undefined as string | undefined,
  rebuildTimer: undefined as number | undefined,
  streamTimer: undefined as number | undefined,
  noteTimer: undefined as number | undefined,
  streaming: false,
  streamLines: [] as string[],
  /** How many lines of the stream have been applied. */
  streamIndex: 0,
  speed: 1 as number,
  events: [] as PlaygroundEvent[],
  nextEventId: 1,
  inspectorRefreshQueued: false,
  activeTab: 0,
};

function truncate(text: string): string {
  return text.length <= MAX_DETAIL_CHARACTERS ? text : `${text.slice(0, MAX_DETAIL_CHARACTERS)}…`;
}

function setStreamStatus(text: string): void {
  ui.streamStatus.textContent = text;
}

function setCopyStatus(text: string): void {
  ui.copyStatus.textContent = text;
}

/** Shows a short pill next to the icon buttons. It hides after a moment. */
function flashNote(text: string): void {
  window.clearTimeout(state.noteTimer);
  ui.transientNote.textContent = text;
  ui.transientNote.hidden = false;
  state.noteTimer = window.setTimeout(() => {
    ui.transientNote.hidden = true;
  }, NOTE_MILLISECONDS);
}

/** Frames are newline-terminated lines. A text that ends with a newline has no extra frame after it. */
function frameLinesOf(text: string): string[] {
  if (text === "") return [];
  return text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
}

// Session lifecycle

function hooksFor(generation: number): SessionHooks {
  return {
    // Observers from an older session are ignored, so a rebuild never shows its events.
    onRuntimeEvent: (event) => {
      if (generation === state.generation) recordRuntimeEvent(event);
    },
    onServerEvent: (event) => {
      if (generation === state.generation) recordServerEvent(event);
    },
  };
}

function createSession(): PlaygroundSession {
  state.generation += 1;
  state.session?.dispose();
  const session = new PlaygroundSession(page, hooksFor(state.generation));
  state.session = session;
  state.mounted = false;
  return session;
}

/** Rebuilds from the editor text: a fresh runtime, the whole text, then the mount. */
function rebuildNow(): void {
  window.clearTimeout(state.rebuildTimer);
  state.rebuildTimer = undefined;
  const session = createSession();
  session.pushText(ui.source.value);
  session.finish();
  state.mounted = session.mountPreview(ui.preview);
  renderAll();
}

function scheduleRebuild(): void {
  window.clearTimeout(state.rebuildTimer);
  state.rebuildTimer = window.setTimeout(rebuildNow, REBUILD_DELAY_MS);
}

// Events and the data model

function recordRuntimeEvent(event: WeaverRuntimeEvent): void {
  // Only input writes are listed here. Actions arrive through onServerEvent, with their name.
  if (event.kind !== "input") return;
  const { sourceComponentId, property, value } = event.request;
  const status = event.result.ok ? "accepted" : `rejected: ${event.result.error.code}`;
  pushEvent("Input", truncate(`${sourceComponentId}.${property} = ${JSON.stringify(value)}`), status);
}

function recordServerEvent(event: WebServerEventHandoff): void {
  const { name, context } = event.message.action;
  pushEvent("Action", truncate(`${name} ${JSON.stringify(context)}`), "shown here, not sent");
}

function pushEvent(kind: PlaygroundEvent["kind"], detail: string, status: string): void {
  state.events.unshift({ id: state.nextEventId, kind, detail, status });
  state.nextEventId += 1;
  state.events.length = Math.min(state.events.length, MAX_EVENTS);
  queueInspectorRefresh();
}

/**
 * Input writes change the data model, and the write finishes after the observer runs.
 * So the inspector refreshes in a microtask, once that write has completed.
 */
function queueInspectorRefresh(): void {
  if (state.inspectorRefreshQueued) return;
  state.inspectorRefreshQueued = true;
  queueMicrotask(() => {
    state.inspectorRefreshQueued = false;
    renderInspector();
  });
}

// Rendering

function renderAll(): void {
  renderBackdrop(errorLinesOf(), state.streaming ? state.streamIndex : undefined);
  renderPreviewState();
  renderExamples();
  renderInspector();
  renderStreamControls();
  renderSpeed();
}

function errorLinesOf(): Set<number> {
  const lines = new Set<number>();
  for (const error of state.session?.errors ?? []) {
    if (error.frame !== undefined) lines.add(error.frame);
  }
  return lines;
}

/**
 * Draws the editor's backdrop: one row per logical line, with a gutter number and the text. The
 * textarea on top has the same font, padding, width and wrapping, so both wrap identically. Rows
 * are built with createElement and textContent only.
 */
function renderBackdrop(errorLines: ReadonlySet<number>, arrivedCount: number | undefined): void {
  const lines = ui.source.value.split("\n");
  const rows = document.createDocumentFragment();
  lines.forEach((text, index) => {
    const lineNumber = index + 1;
    const row = element("div", "line");
    if (errorLines.has(lineNumber)) row.classList.add("is-error");
    if (arrivedCount !== undefined) {
      if (lineNumber === arrivedCount) row.classList.add("is-current");
      if (lineNumber > arrivedCount) row.classList.add("is-pending");
    }
    // An empty line still needs one row of text, so the wrapping matches the textarea.
    row.append(element("span", "line-num", String(lineNumber)), element("span", "line-text", text === "" ? " " : text));
    rows.append(row);
  });
  ui.backdrop.replaceChildren(rows);
  ui.backdrop.scrollTop = ui.source.scrollTop;
}

function renderPreviewState(): void {
  const message = previewMessage(state.session);
  ui.previewEmpty.hidden = message === "";
  ui.previewEmpty.textContent = message;
}

function previewMessage(session: PlaygroundSession | undefined): string {
  if (session === undefined || session.surfaceId === undefined) {
    return "No surface yet. The preview appears once a createSurface message is accepted.";
  }
  if (!state.mounted) return "The surface could not be rendered. See the Errors tab.";
  return "";
}

function renderExamples(): void {
  for (const button of ui.exampleList.querySelectorAll<HTMLButtonElement>("button.example")) {
    const isCurrent = button.dataset.exampleId === state.currentExampleId;
    button.setAttribute("aria-pressed", String(isCurrent));
    button.disabled = state.streaming;
  }
}

function renderSpeed(): void {
  for (const button of ui.speedButtons) {
    const isCurrent = Number(button.dataset.speed) === state.speed;
    button.setAttribute("aria-pressed", String(isCurrent));
  }
}

function renderInspector(): void {
  renderEventList();
  const session = state.session;
  ui.dataModel.textContent =
    session === undefined || session.surfaceId === undefined
      ? "No surface yet."
      : JSON.stringify(session.dataModel(), null, 2);
  renderErrors(session?.errors ?? []);
}

function renderEventList(): void {
  const items = document.createDocumentFragment();
  for (const event of state.events) {
    const item = element("li", "event-row");
    const kind = element("span", event.kind === "Input" ? "pg-badge pg-badge-muted" : "pg-badge pg-badge-inverse", event.kind);
    const detail = element("span", "event-text", `${event.detail}  ·  ${event.status}`);
    item.append(kind, detail);
    items.append(item);
  }
  ui.eventList.replaceChildren(items);
  ui.eventEmpty.hidden = state.events.length > 0;
}

function renderErrors(errors: readonly WeaverErrorDescription[]): void {
  const count = errors.length;
  ui.errorCount.textContent = String(count);
  ui.errorCount.setAttribute("aria-label", `${count} ${count === 1 ? "error" : "errors"}`);
  renderDiagnosticsPanel(ui.errorPanel, errors, {
    title: "Errors",
    headingLevel: 3,
    emptyText: "No errors. Every frame was accepted.",
  });
  const firstRejected = errors.find((error) => error.frame !== undefined);
  ui.rejectChip.hidden = firstRejected === undefined;
  if (firstRejected !== undefined) ui.rejectChip.textContent = `Line ${firstRejected.frame} rejected`;
}

function renderPrompt(): void {
  const prompt = generateA2UIV091Prompt({
    catalogs: [createBasicCatalogV091Registration()],
    mode: "create",
  });
  ui.promptText.textContent = prompt.ok ? prompt.value.text : `Prompt generation failed: ${prompt.error.code}`;
}

function renderStreamControls(): void {
  ui.streamButton.textContent = state.streaming ? "Stop" : "Stream it";
  ui.streamButton.setAttribute("aria-label", state.streaming ? "Stop streaming" : "Stream it");
  ui.resetButton.disabled = state.streaming;
  ui.source.readOnly = state.streaming;
  ui.source.setAttribute("aria-busy", String(state.streaming));
}

// Examples and editing

function buildExampleList(): void {
  const items = document.createDocumentFragment();
  for (const example of PLAYGROUND_EXAMPLES) {
    const item = element("li");
    const button = element("button", "example");
    button.type = "button";
    button.dataset.exampleId = example.id;
    button.setAttribute("aria-pressed", "false");
    button.append(element("span", "example-title", example.title), element("span", "example-summary", example.summary));
    if (example.broken) button.append(element("span", "pg-badge pg-badge-reject", "Error demo"));
    button.addEventListener("click", () => requestExample(example.id));
    item.append(button);
    items.append(item);
  }
  ui.exampleList.replaceChildren(items);
}

function requestExample(id: string): void {
  if (state.streaming) return;
  const isEdited = ui.source.value !== state.baseline;
  if (isEdited) {
    state.pendingExampleId = id;
    const example = findExample(id);
    ui.confirmText.textContent = `Replace your edited text with the "${example?.title ?? id}" example? Your edits will be lost.`;
    ui.confirmBar.hidden = false;
    ui.confirmReplace.focus();
    return;
  }
  loadExample(id);
}

function loadExample(id: string): void {
  const example = findExample(id);
  if (example === undefined) return;
  hideConfirm();
  state.currentExampleId = id;
  setEditorText(example.jsonl);
}

function hideConfirm(): void {
  state.pendingExampleId = undefined;
  ui.confirmBar.hidden = true;
}

/** Sets the editor text as the new baseline and rebuilds the preview at once. */
function setEditorText(text: string): void {
  ui.source.value = text;
  state.baseline = text;
  ui.source.scrollTop = 0;
  ui.backdrop.scrollTop = 0;
  rebuildNow();
}

// Stream

function startStream(): void {
  if (state.streaming) return;
  const lines = frameLinesOf(ui.source.value);
  if (lines.length === 0) {
    setStreamStatus("There is nothing to stream. Add some JSONL first.");
    return;
  }
  hideConfirm();
  window.clearTimeout(state.rebuildTimer);
  state.rebuildTimer = undefined;
  state.streaming = true;
  state.streamLines = lines;
  state.streamIndex = 0;
  createSession();
  setStreamStatus(`Streaming ${lines.length} ${lines.length === 1 ? "line" : "lines"}.`);
  renderAll();
  streamNextLine();
}

function streamNextLine(): void {
  state.streamTimer = undefined;
  if (!state.streaming || state.session === undefined) return;
  if (state.streamIndex >= state.streamLines.length) {
    finishStream("finished");
    return;
  }
  const session = state.session;
  const line = state.streamLines[state.streamIndex] ?? "";
  state.streamIndex += 1;
  // Each line is one frame: the same line-by-line path a provider stream takes.
  session.pushText(`${line}\n`);
  if (state.mounted) {
    session.refreshPreview();
  } else {
    // The preview mounts once the first createSurface is accepted, then refreshes.
    state.mounted = session.mountPreview(ui.preview);
  }
  setStreamStatus(`Line ${state.streamIndex} of ${state.streamLines.length}`);
  renderAll();
  state.streamTimer = window.setTimeout(streamNextLine, STREAM_LINE_DELAY_MS / state.speed);
}

function stopStream(): void {
  if (!state.streaming) return;
  finishStream("stopped");
}

function finishStream(outcome: "finished" | "stopped"): void {
  window.clearTimeout(state.streamTimer);
  state.streamTimer = undefined;
  const session = state.session;
  if (session !== undefined) session.finish();
  state.streaming = false;
  const total = state.streamLines.length;
  if (outcome === "finished") {
    const rejected = session?.errors.length ?? 0;
    const accepted = session?.acceptedFrames ?? 0;
    setStreamStatus(`Stream finished: ${accepted} accepted, ${rejected} ${rejected === 1 ? "error" : "errors"}.`);
  } else {
    setStreamStatus(`Stopped at line ${state.streamIndex} of ${total}.`);
  }
  renderAll();
}

// Share, copy, and the URL fragment

function showFallback(text: string): void {
  ui.fallbackText.value = text;
  ui.fallback.hidden = false;
  ui.fallbackText.focus();
  ui.fallbackText.select();
}

function hideFallback(): void {
  ui.fallback.hidden = true;
  ui.fallbackText.value = "";
}

async function copyText(text: string, successMessage: string, note: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    hideFallback();
    setCopyStatus(successMessage);
    flashNote(note);
  } catch {
    showFallback(text);
    setCopyStatus("Copying was blocked. The text is selected below, so copy it with Ctrl+C or Cmd+C.");
  }
}

async function shareText(): Promise<void> {
  const encoded = encodeSharedJsonl(ui.source.value);
  if (!encoded.ok) {
    setCopyStatus("This text is larger than 64 KB, so it cannot be shared as a link.");
    return;
  }
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}${encoded.fragment}`;
  try {
    window.history.replaceState(null, "", encoded.fragment);
  } catch {
    // The address bar may not update in some embedded views. The copied link still works.
  }
  await copyText(url, "Share link copied. The link holds your text, so anyone with it can read the text.", "Link copied");
}

function loadFromHash(): boolean {
  const shared = decodeSharedJsonl(window.location.hash);
  if (shared.ok) {
    state.currentExampleId = undefined;
    setEditorText(shared.text);
    setCopyStatus("Loaded the text from the share link.");
    return true;
  }
  if (shared.reason !== "absent") {
    ui.shareNotice.textContent = describeShareDecodeFailure(shared.reason);
    ui.shareNotice.hidden = false;
  }
  return false;
}

// Speed, menu and tabs

function setSpeed(value: number): void {
  state.speed = value;
  renderSpeed();
}

function bindSpeed(): void {
  for (const button of ui.speedButtons) {
    button.addEventListener("click", () => setSpeed(Number(button.dataset.speed)));
  }
}

function toggleMenu(): void {
  const isOpen = ui.menuToggle.getAttribute("aria-expanded") === "true";
  ui.menuToggle.setAttribute("aria-expanded", String(!isOpen));
  ui.menuToggle.setAttribute("aria-label", isOpen ? "Open menu" : "Close menu");
  ui.menuSheet.hidden = isOpen;
  // The icon is a hamburger when closed and a cross when open.
  ui.menuIcon.setAttribute("d", isOpen ? "M4 8h16M4 16h16" : "M6 6l12 12M18 6L6 18");
}

function activateTab(index: number, moveFocus = false): void {
  state.activeTab = index;
  ui.tabs.forEach((entry, position) => {
    const selected = position === index;
    entry.tab.setAttribute("aria-selected", String(selected));
    entry.tab.tabIndex = selected ? 0 : -1;
    entry.panel.hidden = !selected;
  });
  if (moveFocus) ui.tabs[index]?.tab.focus();
}

function bindTabs(): void {
  ui.tabs.forEach((entry, index) => {
    entry.tab.addEventListener("click", () => activateTab(index));
    entry.tab.addEventListener("keydown", (event) => {
      const last = ui.tabs.length - 1;
      let next: number | undefined;
      if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
      else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      if (next === undefined) return;
      event.preventDefault();
      activateTab(next, true);
    });
  });
}

// Wiring

function bindEvents(): void {
  ui.source.addEventListener("input", () => {
    // The marks belong to the last rebuild, so they clear until the next one.
    renderBackdrop(new Set(), undefined);
    scheduleRebuild();
  });
  ui.source.addEventListener("scroll", () => {
    ui.backdrop.scrollTop = ui.source.scrollTop;
  });
  ui.streamButton.addEventListener("click", () => {
    if (state.streaming) stopStream();
    else startStream();
  });
  ui.resetButton.addEventListener("click", () => {
    // Reset restores the selected example. An edited text asks first, like a switch does.
    requestExample(state.currentExampleId ?? DEFAULT_EXAMPLE_ID);
  });
  bindSpeed();
  ui.shareButton.addEventListener("click", () => void shareText());
  ui.copyButton.addEventListener("click", () => {
    const snippet = createCodeSnippet(ui.source.value, { surfaceId: PLAYGROUND_SURFACE_ID });
    void copyText(snippet, "Code copied. It uses createBasicWebRuntime and createA2UIV091StreamIngestion.", "Copied");
  });
  ui.copyPrompt.addEventListener("click", () => {
    void copyText(ui.promptText.textContent ?? "", "Prompt copied.", "Copied");
  });
  ui.confirmReplace.addEventListener("click", () => {
    const pending = state.pendingExampleId;
    if (pending !== undefined) loadExample(pending);
    ui.source.focus();
  });
  ui.confirmKeep.addEventListener("click", () => {
    hideConfirm();
    ui.source.focus();
  });
  ui.menuToggle.addEventListener("click", toggleMenu);
}

function start(): void {
  ui.versionBadge.textContent = `v${WEAVER_CORE_VERSION}`;
  buildExampleList();
  renderPrompt();
  bindTabs();
  activateTab(0);
  bindEvents();
  if (!loadFromHash()) {
    state.currentExampleId = DEFAULT_EXAMPLE_ID;
    const example = findExample(DEFAULT_EXAMPLE_ID);
    setEditorText(example?.jsonl ?? "");
  }
  renderAll();
}

start();

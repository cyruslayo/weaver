import "./inspector.css";
import "@weaver/shared/diagnostics-panel.css";
import { renderDiagnosticsPanel } from "@weaver/shared";
import {
  describeWeaverError,
  WEAVER_TRACE_FORMAT,
  WEAVER_TRACE_VERSION,
  type DescribableWeaverError,
  type WeaverErrorDescription,
  type WeaverTrace,
  type WeaverTraceEntry,
  type WeaverTraceReplayOutcome,
} from "@cylayo/weaver-core";
import {
  describeWebRenderError,
  type BasicWebRuntime,
  type WebServerEventHandoff,
  type WebSurfaceMount,
} from "@cylayo/weaver-web";
import sampleText from "../samples/reference-request.weaver-trace.json?raw";
import { existingSurfaceIds, loadTraceText, replayTraceUpTo, type TraceLoadResult } from "./inspector-model.js";

interface SuppressedEvent {
  readonly id: number;
  readonly name: string;
  readonly json: string;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Inspector element #${id} is missing`);
  return found as T;
}

const ui = {
  traceFile: element<HTMLInputElement>("trace-file"),
  loadSample: element<HTMLButtonElement>("load-sample"),
  sourceStatus: element<HTMLParagraphElement>("source-status"),
  loadError: element<HTMLParagraphElement>("load-error"),
  first: element<HTMLButtonElement>("first"),
  previous: element<HTMLButtonElement>("previous"),
  next: element<HTMLButtonElement>("next"),
  last: element<HTMLButtonElement>("last"),
  slider: element<HTMLInputElement>("step-slider"),
  output: element<HTMLOutputElement>("step-output"),
  summary: element<HTMLParagraphElement>("step-summary"),
  timeline: element<HTMLOListElement>("timeline"),
  validity: element<HTMLSpanElement>("validity"),
  errorPanel: element<HTMLElement>("error-panel"),
  entryJson: element<HTMLPreElement>("entry-json"),
  surfaceJson: element<HTMLPreElement>("surface-json"),
  resolvedJson: element<HTMLPreElement>("resolved-json"),
  checksJson: element<HTMLPreElement>("checks-json"),
  outcomeJson: element<HTMLPreElement>("outcome-json"),
  stage: element<HTMLDivElement>("stage"),
  stageEmpty: element<HTMLParagraphElement>("stage-empty"),
  suppressedLog: element<HTMLOListElement>("suppressed-log"),
  suppressedCount: element<HTMLParagraphElement>("suppressed-count"),
  clearSuppressed: element<HTMLButtonElement>("clear-suppressed"),
};

const emptyTrace: WeaverTrace = { format: WEAVER_TRACE_FORMAT, version: WEAVER_TRACE_VERSION, truncated: false, entries: [] };

let trace: WeaverTrace = emptyTrace;
let index = 0;
let mount: WebSurfaceMount | undefined;
let suppressedCounter = 0;
const suppressed: SuppressedEvent[] = [];

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined";
  } catch {
    return "(this value cannot be shown as JSON)";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Describes an error recorded in a trace. The recorded value is data from a file,
 * so an unknown shape falls back to a plain description instead of throwing.
 */
function describeRecordedError(error: unknown): WeaverErrorDescription {
  try {
    return describeWeaverError(error as DescribableWeaverError);
  } catch {
    const code = isRecord(error) && typeof error.code === "string" ? error.code : "UNKNOWN";
    return { code, severity: "error", summary: "This recorded error could not be described.", causes: [] };
  }
}

function outcomeText(outcome: WeaverTraceReplayOutcome | null): string {
  if (outcome === null) return "not re-applied (frame-error entries are reported, never applied)";
  return outcome.ok ? "ok" : `error ${outcome.code ?? "(no code)"}`;
}

function renderTimeline(): void {
  ui.timeline.replaceChildren();
  trace.entries.forEach((entry, position) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.position = String(position);
    button.className = entry.outcome.ok ? "timeline-step" : "timeline-step is-error";
    button.textContent = `${entry.seq}. ${entry.kind}${entry.outcome.ok ? "" : " (error)"}`;
    button.addEventListener("click", () => go(position));
    item.append(button);
    ui.timeline.append(item);
  });
}

function markTimeline(current: number): void {
  ui.timeline.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (Number(button.dataset.position) === current) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
}

function unmountLive(): void {
  mount?.unmount();
  mount = undefined;
  ui.stage.replaceChildren();
}

function renderSuppressed(): void {
  ui.suppressedLog.replaceChildren();
  for (const event of suppressed) {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = `${event.name} (not sent)`;
    const body = document.createElement("pre");
    body.className = "code";
    body.textContent = event.json;
    item.append(name, body);
    ui.suppressedLog.append(item);
  }
  ui.suppressedCount.textContent =
    suppressed.length === 0
      ? "No suppressed events yet."
      : `${suppressed.length} suppressed event${suppressed.length === 1 ? "" : "s"}. Nothing was sent.`;
}

function handleServerEvent(event: WebServerEventHandoff): void {
  // The inspector only records the event. It never sends it, stores it, or acts on it.
  suppressedCounter += 1;
  suppressed.push({ id: suppressedCounter, name: event.message.action.name, json: safeJson(event.message) });
  renderSuppressed();
}

function renderEntry(entry: WeaverTraceEntry): void {
  const ok = entry.outcome.ok;
  ui.validity.textContent = ok ? "Valid" : entry.kind === "frame-error" ? "Invalid: malformed frame" : "Rejected";
  ui.validity.dataset.state = ok ? "valid" : "invalid";
  ui.entryJson.textContent = safeJson(entry);
  if (entry.outcome.ok) {
    ui.errorPanel.hidden = true;
    ui.errorPanel.replaceChildren();
    return;
  }
  ui.errorPanel.hidden = false;
  renderDiagnosticsPanel(ui.errorPanel, [describeRecordedError(entry.outcome.error)], { title: "Error", headingLevel: 3 });
}

function renderStage(web: BasicWebRuntime, surfaceId: string | undefined): void {
  unmountLive();
  if (surfaceId === undefined) {
    ui.stageEmpty.hidden = false;
    return;
  }
  ui.stageEmpty.hidden = true;
  const mounted = web.mount({ surfaceId, target: ui.stage });
  if (mounted.ok) {
    mount = mounted.value;
    return;
  }
  const failure = document.createElement("div");
  failure.className = "error-panel";
  renderDiagnosticsPanel(failure, [describeWebRenderError(mounted.error)], {
    title: "The surface could not be rendered",
    headingLevel: 3,
  });
  ui.stage.append(failure);
}

function render(): void {
  const entries = trace.entries;
  const count = entries.length;
  markTimeline(index);
  if (count === 0) {
    unmountLive();
    ui.summary.textContent = "The trace has no entries.";
    ui.output.textContent = "0 of 0";
    ui.slider.max = "0";
    ui.slider.value = "0";
    ui.entryJson.textContent = safeJson(trace);
    ui.surfaceJson.textContent = "No entries.";
    ui.resolvedJson.textContent = "No entries.";
    ui.checksJson.textContent = "No entries.";
    ui.outcomeJson.textContent = "No entries.";
    ui.errorPanel.hidden = true;
    return;
  }

  const entry = entries[index];
  if (entry === undefined) return;
  const replayed = replayTraceUpTo(trace, index, handleServerEvent);
  const step = replayed?.replay.steps.at(-1);
  const surfaceId = replayed === undefined ? undefined : existingSurfaceIds(replayed.replay)[0];

  const summary = `Step ${index + 1} of ${count}: ${entry.kind}, sequence ${entry.seq}${entry.outcome.ok ? "" : ", rejected"}.`;
  ui.summary.textContent = summary;
  ui.output.textContent = `${index + 1} of ${count}`;
  ui.slider.max = String(count - 1);
  ui.slider.value = String(index);
  ui.slider.setAttribute("aria-valuetext", summary);

  renderEntry(entry);

  if (replayed === undefined) {
    unmountLive();
    ui.stageEmpty.hidden = false;
    ui.stageEmpty.textContent = "The runtime for this step could not be configured.";
    ui.surfaceJson.textContent = "Unavailable: the runtime could not be configured.";
    ui.resolvedJson.textContent = "Unavailable.";
    ui.checksJson.textContent = "Unavailable.";
    ui.outcomeJson.textContent = "Unavailable.";
    return;
  }

  renderStage(replayed.web, surfaceId);

  const snapshot = surfaceId === undefined ? undefined : replayed.replay.surfaces[surfaceId];
  ui.surfaceJson.textContent = snapshot === undefined ? "No surface exists at this step." : safeJson(snapshot);

  if (surfaceId === undefined) {
    ui.resolvedJson.textContent = "No surface exists at this step.";
    ui.checksJson.textContent = "No surface exists at this step.";
  } else {
    const resolved = replayed.web.runtime.resolveSurface(surfaceId);
    if (resolved.ok) {
      ui.resolvedJson.textContent = safeJson({ tree: resolved.value.tree, issues: resolved.value.issues });
      ui.checksJson.textContent = safeJson(resolved.value.checks);
    } else {
      const failure = describeWeaverError(resolved.error);
      ui.resolvedJson.textContent = `${failure.summary}\n\n${safeJson(resolved.error)}`;
      ui.checksJson.textContent = "Not evaluated: the surface did not resolve.";
    }
  }

  if (step === undefined) {
    ui.outcomeJson.textContent = "No replay result for this step.";
  } else {
    const lines = [
      `Entry kind: ${entry.kind}`,
      `Recorded: ${outcomeText(step.recorded)}`,
      `Replayed: ${outcomeText(step.replayed)}`,
      `Diverged: ${step.diverged ? "yes" : "no"}`,
    ];
    if (entry.kind === "action") lines.push("", "Recorded action outcome:", safeJson(entry.outcome));
    ui.outcomeJson.textContent = lines.join("\n");
  }
}

function go(to: number): void {
  const count = trace.entries.length;
  if (count === 0) return;
  index = Math.min(Math.max(to, 0), count - 1);
  render();
}

function applyTrace(result: TraceLoadResult, label: string): void {
  if (!result.ok) {
    ui.loadError.hidden = false;
    ui.loadError.textContent = result.message;
    return;
  }
  ui.loadError.hidden = true;
  ui.loadError.textContent = "";
  trace = result.trace;
  index = 0;
  const truncated = trace.truncated ? " Earlier entries were dropped when it was recorded." : "";
  ui.sourceStatus.textContent = `Loaded ${label}: ${trace.entries.length} entries.${truncated}`;
  renderTimeline();
  render();
}

ui.traceFile.addEventListener("change", () => {
  const file = ui.traceFile.files?.[0];
  if (file === undefined) return;
  void file
    .text()
    .then((text) => applyTrace(loadTraceText(text), `file "${file.name}"`))
    .catch(() => applyTrace({ ok: false, message: "The file could not be read." }, "file"))
    .finally(() => {
      ui.traceFile.value = "";
    });
});

ui.loadSample.addEventListener("click", () => applyTrace(loadTraceText(sampleText), "the bundled sample"));
ui.first.addEventListener("click", () => go(0));
ui.previous.addEventListener("click", () => go(index - 1));
ui.next.addEventListener("click", () => go(index + 1));
ui.last.addEventListener("click", () => go(trace.entries.length - 1));
ui.slider.addEventListener("input", () => go(Number(ui.slider.value)));
ui.clearSuppressed.addEventListener("click", () => {
  suppressed.length = 0;
  renderSuppressed();
});

// Shortcuts apply when focus is not in a form field, the slider, or the live surface.
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof Element && target.closest("input, select, textarea, [contenteditable], #stage") !== null) return;
  switch (event.key) {
    case "ArrowLeft":
      go(index - 1);
      break;
    case "ArrowRight":
      go(index + 1);
      break;
    case "Home":
      go(0);
      break;
    case "End":
      go(trace.entries.length - 1);
      break;
    default:
      return;
  }
  event.preventDefault();
});

applyTrace(loadTraceText(sampleText), "the bundled sample");
renderSuppressed();

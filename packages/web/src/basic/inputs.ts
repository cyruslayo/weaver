import type { BasicRegexMatcher, ComponentCheckSnapshot, HydratedValue } from "@weaver/core";
import type { WebComponentRenderInput, WebComponentRenderer } from "../renderers/index.js";
import { applyBasicHook } from "./layout.js";
import { appendBasicStyle, applyBasicMargin, basicControl, basicOutline, basicRadius, basicSpace } from "./styles.js";

type NativeControl = HTMLInputElement | HTMLTextAreaElement;
type Option = { label?: unknown; value: string };

export function createBasicInputRenderers(regexMatcher?: BasicRegexMatcher): Record<"TextField" | "CheckBox" | "Slider" | "ChoicePicker" | "DateTimeInput", WebComponentRenderer> {
  let opaqueId = 0;
  const nextId = (kind: string) => `weaver-basic-${kind}-${++opaqueId}`;

  const renderTextField: WebComponentRenderer = (input) => {
    const { document, properties, interactions } = input;
    const wrapper = componentWrapper(document, "TextField", properties.variant ?? "shortText");
    const id = nextId("field");
    wrapper.append(labelFor(document, id, stringOrEmpty(properties.label)));
    const variant = properties.variant === "longText" || properties.variant === "number" || properties.variant === "obscured"
      ? properties.variant : "shortText";
    const control: NativeControl = variant === "longText" ? document.createElement("textarea") : document.createElement("input");
    if (control instanceof document.defaultView!.HTMLInputElement) control.type = variant === "number" ? "number" : variant === "obscured" ? "password" : "text";
    control.id = id;
    control.value = typeof properties.value === "string" ? properties.value : "";
    interactions.registerControl(control, "value");
    const regexp = evaluateRegexp(properties.value, properties.validationRegexp, regexMatcher);
    if (regexp !== "absent") wrapper.setAttribute("data-a2ui-regexp-state", regexp);
    applyValidation(document, wrapper, [control], input.checks, nextId, regexp);
    let composing = false;
    control.addEventListener("compositionstart", () => { composing = true; });
    control.addEventListener("input", () => { if (!composing) interactions.writeInput("value", control.value); });
    control.addEventListener("compositionend", () => { composing = false; interactions.writeInput("value", control.value); });
    wrapper.append(control);
    return wrapper;
  };

  const renderCheckBox: WebComponentRenderer = (input) => {
    const { document, properties, interactions } = input;
    const wrapper = componentWrapper(document, "CheckBox");
    const label = document.createElement("label");
    const control = document.createElement("input");
    control.type = "checkbox";
    applyPrimaryAccent(control);
    control.checked = properties.value === true;
    const text = document.createElement("span");
    text.textContent = stringOrEmpty(properties.label);
    label.append(control, text);
    interactions.registerControl(control, "value");
    applyValidation(document, wrapper, [control], input.checks, nextId);
    control.addEventListener("change", () => interactions.writeInput("value", control.checked));
    wrapper.append(label);
    return wrapper;
  };

  const renderSlider: WebComponentRenderer = (input) => {
    const { document, properties, interactions } = input;
    const wrapper = componentWrapper(document, "Slider");
    const id = nextId("slider");
    wrapper.append(labelFor(document, id, stringOrEmpty(properties.label)));
    const control = document.createElement("input");
    control.id = id;
    control.type = "range";
    applyPrimaryAccent(control);
    control.min = typeof properties.min === "number" && Number.isFinite(properties.min) ? String(properties.min) : "0";
    if (typeof properties.max === "number" && Number.isFinite(properties.max)) control.max = String(properties.max);
    control.step = "any";
    if (typeof properties.value === "number" && Number.isFinite(properties.value)) control.value = String(properties.value);
    else control.disabled = true;
    interactions.registerControl(control, "value");
    applyValidation(document, wrapper, [control], input.checks, nextId);
    control.addEventListener("input", () => {
      const value = Number(control.value);
      if (Number.isFinite(value)) interactions.writeInput("value", value);
    });
    wrapper.append(control);
    return wrapper;
  };

  const renderChoicePicker: WebComponentRenderer = (input) => {
    const { document, properties, interactions } = input;
    const wrapper = componentWrapper(document, "ChoicePicker");
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = stringOrEmpty(properties.label);
    fieldset.append(legend);
    const displayStyle = properties.displayStyle === "chips" ? "chips" : "checkbox";
    wrapper.setAttribute("data-a2ui-display-style", displayStyle);
    appendBasicStyle(fieldset, `border: 1px solid ${basicOutline}; border-radius: ${basicRadius}; padding: ${basicSpace}`);
    const optionsContainer = document.createElement("div");
    optionsContainer.setAttribute("data-a2ui-choice-options", "");
    if (displayStyle === "chips") {
      optionsContainer.style.display = "flex";
      optionsContainer.style.flexWrap = "wrap";
    }
    const options = optionList(properties.options);
    const selected = stringList(properties.value);
    const multiple = properties.variant === "multipleSelection";
    const radioSelection = multiple ? undefined : options.find((option) => selected.includes(option.value))?.value;
    const groupName = nextId("choice-group");
    const optionRows: HTMLElement[] = [];
    const controls: HTMLInputElement[] = [];
    if (properties.filterable === true) {
      const filterId = nextId("choice-filter");
      const filterLabel = labelFor(document, filterId, "Filter options");
      const filter = document.createElement("input");
      filter.id = filterId;
      filter.type = "search";
      interactions.registerControl(filter, "filter");
      filter.addEventListener("input", () => {
        const query = filter.value.toLocaleLowerCase();
        optionRows.forEach((row, index) => { row.hidden = !stringOrEmpty(options[index]?.label).toLocaleLowerCase().includes(query); });
      });
      fieldset.append(filterLabel, filter);
    }
    options.forEach((option, index) => {
      const row = document.createElement("label");
      const control = document.createElement("input");
      control.type = multiple ? "checkbox" : "radio";
      applyPrimaryAccent(control);
      control.name = groupName;
      control.value = option.value;
      control.checked = multiple ? selected.includes(option.value) : radioSelection === option.value;
      const text = document.createElement("span");
      text.textContent = stringOrEmpty(option.label);
      row.append(control, text);
      if (displayStyle === "chips") {
        row.style.display = "inline-flex";
        row.style.alignItems = "center";
        appendBasicStyle(row, `border: 1px solid ${control.checked ? "var(--a2ui-color-primary, #17e)" : basicOutline}; border-radius: 999px; padding: calc(${basicSpace} / 2) ${basicSpace}; background: ${control.checked ? "var(--a2ui-color-control, rgba(127, 127, 127, 0.16))" : basicControl}`);
      } else {
        row.style.display = "block";
        appendBasicStyle(row, `padding: calc(${basicSpace} / 2)`);
      }
      optionRows.push(row);
      controls.push(control);
      interactions.registerControl(control, `option:${index}`);
      control.addEventListener("change", () => {
        if (!multiple) { if (control.checked) interactions.writeInput("value", [option.value]); return; }
        const current = stringList(properties.value);
        if (control.checked) { if (!current.includes(option.value)) current.push(option.value); }
        else { const position = current.indexOf(option.value); if (position >= 0) current.splice(position, 1); }
        interactions.writeInput("value", current);
      });
      optionsContainer.append(row);
    });
    fieldset.append(optionsContainer);
    applyValidation(document, wrapper, controls, input.checks, nextId);
    wrapper.append(fieldset);
    return wrapper;
  };

  const renderDateTimeInput: WebComponentRenderer = (input) => {
    const { document, properties, interactions } = input;
    const wrapper = componentWrapper(document, "DateTimeInput");
    const id = nextId("datetime");
    wrapper.append(labelFor(document, id, stringOrEmpty(properties.label)));
    const control = document.createElement("input");
    control.id = id;
    const date = properties.enableDate === true;
    const time = properties.enableTime === true;
    const value = typeof properties.value === "string" ? properties.value : "";
    if (!date && !time) { control.type = "text"; control.value = value; control.disabled = true; }
    else if (date && !time) { control.type = "date"; control.value = normalizeDate(value); setConstraint(control, "min", properties.min, normalizeDate); setConstraint(control, "max", properties.max, normalizeDate); }
    else if (!date && time) { control.type = "time"; control.step = "1"; control.value = normalizeTime(value); setConstraint(control, "min", properties.min, normalizeTime); setConstraint(control, "max", properties.max, normalizeTime); }
    else { control.type = "datetime-local"; control.value = isoToLocal(value); setConstraint(control, "min", properties.min, isoToLocal); setConstraint(control, "max", properties.max, isoToLocal); }
    interactions.registerControl(control, "value");
    applyValidation(document, wrapper, date || time ? [control] : [], input.checks, nextId);
    if (date || time) control.addEventListener("change", () => {
      if (!control.value) { interactions.writeInput("value", ""); return; }
      if (date && time) { const iso = localToIso(control.value); if (iso !== undefined) interactions.writeInput("value", iso); }
      else interactions.writeInput("value", control.value);
    });
    wrapper.append(control);
    return wrapper;
  };

  return { TextField: renderTextField, CheckBox: renderCheckBox, Slider: renderSlider, ChoicePicker: renderChoicePicker, DateTimeInput: renderDateTimeInput };
}

function applyPrimaryAccent(control: HTMLInputElement): void {
  control.style.accentColor = "var(--a2ui-color-primary, #17e)";
}

function componentWrapper(document: Document, component: string, variant?: HydratedValue): HTMLDivElement {
  const wrapper = document.createElement("div");
  applyBasicHook(wrapper, component);
  applyBasicMargin(wrapper);
  if (typeof variant === "string") wrapper.setAttribute("data-a2ui-variant", variant);
  return wrapper;
}
function labelFor(document: Document, id: string, text: string): HTMLLabelElement { const label = document.createElement("label"); label.htmlFor = id; label.textContent = text; return label; }
function stringOrEmpty(value: unknown): string { return typeof value === "string" ? value : ""; }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function optionList(value: unknown): Option[] { return Array.isArray(value) ? value.filter((item): item is Option => typeof item === "object" && item !== null && typeof (item as { value?: unknown }).value === "string") : []; }

type RegexpState = "absent" | "passed" | "failed" | "pending" | "error" | "unavailable";
type ValidationState = "valid" | "invalid" | "pending" | "error";

function evaluateRegexp(value: HydratedValue, pattern: HydratedValue, matcher: BasicRegexMatcher | undefined): RegexpState {
  if (typeof pattern !== "string") return "absent";
  if (matcher === undefined) return "unavailable";
  if (value === undefined) return "pending";
  if (typeof value !== "string") return "error";
  try {
    const result = matcher({ value, pattern });
    return typeof result !== "boolean" ? "error" : result ? "passed" : "failed";
  } catch {
    return "error";
  }
}

function combinedValidationState(checks: ComponentCheckSnapshot | undefined, regexp: RegexpState): ValidationState {
  const core = checks?.status ?? "valid";
  if (core === "invalid" || regexp === "failed") return "invalid";
  if (core === "error" || regexp === "error") return "error";
  if (core === "pending" || regexp === "pending") return "pending";
  return "valid";
}

function applyValidation(document: Document, wrapper: HTMLElement, controls: readonly HTMLElement[], checks: ComponentCheckSnapshot | undefined, nextId: (kind: string) => string, regexp: RegexpState = "absent"): void {
  const status = combinedValidationState(checks, regexp);
  if (checks !== undefined || regexp !== "absent") wrapper.setAttribute("data-a2ui-validation-state", status);
  if (status === "invalid") controls.forEach((control) => control.setAttribute("aria-invalid", "true"));

  const messages: string[] = [];
  const list = document.createElement("div");
  if (checks?.status === "invalid") {
    for (const check of checks.checks) {
      if (check.status !== "failed") continue;
      const message = document.createElement("div");
      message.id = nextId("validation");
      message.textContent = check.message;
      messages.push(message.id);
      list.append(message);
    }
  }
  if (regexp === "failed") {
    const message = document.createElement("div");
    message.id = nextId("validation");
    message.textContent = "Value does not match the required format.";
    messages.push(message.id);
    list.append(message);
  }
  if (messages.length === 0) return;
  controls.forEach((control) => mergeDescribedBy(control, messages));
  wrapper.append(list);
}

function mergeDescribedBy(control: HTMLElement, messageIds: readonly string[]): void {
  const tokens = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  messageIds.forEach((id) => tokens.add(id));
  if (tokens.size > 0) control.setAttribute("aria-describedby", [...tokens].join(" "));
}
function normalizeDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? value : "";
}
function normalizeTime(value: string): string { return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(value) ? value : ""; }
function isoToLocal(value: string): string { if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const pad = (number: number) => String(number).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; }
function localToIso(value: string): string | undefined { const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
function setConstraint(control: HTMLInputElement, name: "min" | "max", value: unknown, normalize: (value: string) => string): void { if (typeof value !== "string") return; const normalized = normalize(value); if (normalized) control.setAttribute(name, normalized); }

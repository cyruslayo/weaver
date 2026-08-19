import assert from "node:assert/strict";
import { test } from "node:test";
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createBasicCatalogV091Registration,
  type JsonObject,
} from "@weaver/core";
import { Window } from "happy-dom";
import { RendererRegistryConfigurationError } from "../renderers/index.js";
import { createBasicWebRuntime, type BasicWebRuntimeConfig } from "./index.js";

function dom() {
  const window = new Window();
  return {
    document: window.document as unknown as Document,
    target: window.document.createElement("main") as unknown as Element,
  };
}

function message(surfaceId: string, catalogId: string, text = "Hello") {
  return [
    { version: "v0.9.1", createSurface: { surfaceId, catalogId, theme: { primaryColor: "#112233", agentDisplayName: "Untrusted", iconUrl: "https://invalid.example/icon" } } },
    { version: "v0.9.1", updateComponents: { surfaceId, components: [{ id: "root", component: "Text", text }] } },
  ];
}

function customCatalog(catalogId: string): { catalogId: string; schema: JsonObject } {
  return {
    catalogId,
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      catalogId,
      components: { Custom: { type: "object", properties: { id: { type: "string" }, component: { const: "Custom" } }, required: ["id", "component"], additionalProperties: false } },
      functions: {},
      $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {} } },
    },
  };
}

test("creates the canonical Basic Web runtime with the canonical catalog ID", () => {
  const created = createBasicWebRuntime();
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.value.catalogId, A2UI_V091_BASIC_CATALOG_ID);
});

test("cannot override the canonical Basic renderer catalog ID at runtime", () => {
  const maliciousBasic = { catalogId: "attacker-controlled" };
  const created = createBasicWebRuntime({ basic: maliciousBasic as BasicWebRuntimeConfig["basic"] });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.value.catalogId, A2UI_V091_BASIC_CATALOG_ID);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: "canonical", catalogId: created.value.catalogId } }).ok, true);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: "canonical", components: [{ id: "root", component: "Text", text: "Canonical" }] } }).ok, true);
  const { target } = dom();
  assert.equal(created.value.mount({ surfaceId: "canonical", target }).ok, true);
  assert.equal(target.textContent, "Canonical");
});

test("processes and mounts a canonical Basic surface", () => {
  const created = createBasicWebRuntime();
  assert.ok(created.ok);
  if (!created.ok) return;
  for (const input of message("main", created.value.catalogId)) assert.equal(created.value.runtime.process(input).ok, true);
  const { target } = dom();
  const mounted = created.value.mount({ surfaceId: "main", target });
  assert.equal(mounted.ok, true);
  assert.equal(target.textContent, "Hello");
});

test("installs only the safe canonical Basic theme adapter", () => {
  const created = createBasicWebRuntime();
  assert.ok(created.ok);
  if (!created.ok) return;
  for (const input of message("main", created.value.catalogId)) assert.equal(created.value.runtime.process(input).ok, true);
  const { target } = dom();
  const mounted = created.value.mount({ surfaceId: "main", target });
  assert.ok(mounted.ok);
  const container = target.firstElementChild as HTMLElement;
  assert.equal(container.style.getPropertyValue("--a2ui-color-primary"), "#112233");
  assert.equal(target.querySelector("[data-weaver-surface-attribution]"), null);
  assert.equal(target.querySelector("img"), null);
});

test("renders attribution only from an explicit trusted provider", () => {
  const created = createBasicWebRuntime({ rendering: { attributionProvider: () => ({ displayName: "Trusted host" }) } });
  assert.ok(created.ok);
  if (!created.ok) return;
  for (const input of message("main", created.value.catalogId)) assert.equal(created.value.runtime.process(input).ok, true);
  const { target } = dom();
  const mounted = created.value.mount({ surfaceId: "main", target });
  assert.ok(mounted.ok);
  assert.equal(target.querySelector("[data-weaver-surface-attribution]")?.textContent, "Trusted host");
});

test("passes explicit Basic policies to the composed renderers", () => {
  const seen: string[] = [];
  const created = createBasicWebRuntime({
    basic: {
      resourcePolicy: ({ url }) => { seen.push(`resource:${url}`); return undefined; },
      iconResolver: ({ name }) => { seen.push(`icon:${name}`); return "M0 0"; },
      regexMatcher: ({ value, pattern }) => { seen.push(`regex:${value}:${pattern}`); return true; },
      dateTimeInputLocalValueResolver: ({ rawValue }) => { seen.push(`date:${rawValue}`); return { status: "accept", value: `resolved:${rawValue}` }; },
    },
  });
  assert.ok(created.ok);
  if (!created.ok) return;
  for (const [surfaceId, component] of [
    ["icon", { id: "root", component: "Icon", name: "home" }],
    ["image", { id: "root", component: "Image", url: "https://invalid.example/image.png" }],
    ["regex", { id: "root", component: "TextField", label: "Name", value: "Ada", validationRegexp: "^[A-Z]" }],
  ] as const) {
    assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId, catalogId: created.value.catalogId } }).ok, true);
    assert.equal(created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId, components: [component] } }).ok, true);
    const { target } = dom();
    assert.equal(created.value.mount({ surfaceId, target }).ok, true);
  }
  const dateSurfaceId = "date";
  assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: dateSurfaceId, catalogId: created.value.catalogId } }).ok, true);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: dateSurfaceId, components: [{ id: "root", component: "DateTimeInput", value: { path: "/value" }, enableDate: true, enableTime: true }] } }).ok, true);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", updateDataModel: { surfaceId: dateSurfaceId, value: { value: "2032-01-01T00:00:00.000Z" } } }).ok, true);
  const { target } = dom();
  assert.equal(created.value.mount({ surfaceId: dateSurfaceId, target }).ok, true);
  const input = target.querySelector("input") as HTMLInputElement;
  input.value = "2032-11-07T01:30";
  input.dispatchEvent(new input.ownerDocument.defaultView!.Event("change"));
  assert.equal(seen.includes("date:2032-11-07T01:30"), true);
  assert.equal((created.value.runtime.getSurface(dateSurfaceId)?.dataModel as JsonObject).value, "resolved:2032-11-07T01:30");
  assert.equal(seen.includes("icon:home"), true);
  assert.equal(seen.includes("resource:https://invalid.example/image.png"), true);
  assert.equal(seen.includes("regex:Ada:^[A-Z]"), true);
});

test("does not install an icon resolver by default", () => {
  const created = createBasicWebRuntime();
  assert.ok(created.ok);
  if (!created.ok) return;
  const surfaceId = "default-icon";
  assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId, catalogId: created.value.catalogId } }).ok, true);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId, components: [{ id: "root", component: "Icon", name: "home" }] } }).ok, true);
  const { target } = dom();
  assert.equal(created.value.mount({ surfaceId, target }).ok, true);
  assert.equal(target.querySelector("[data-a2ui-icon-state=unresolved]")?.getAttribute("data-a2ui-component"), "Icon");
  assert.equal(target.querySelector("path"), null);
});

test("does not install a regex matcher by default", () => {
  const created = createBasicWebRuntime();
  assert.ok(created.ok);
  if (!created.ok) return;
  const surfaceId = "default-regex";
  assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId, catalogId: created.value.catalogId } }).ok, true);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId, components: [{ id: "root", component: "TextField", label: "Name", value: "bad", validationRegexp: "p" }] } }).ok, true);
  const { target } = dom();
  assert.equal(created.value.mount({ surfaceId, target }).ok, true);
  assert.equal(target.querySelector("[data-a2ui-component=TextField]")?.getAttribute("data-a2ui-regexp-state"), "unavailable");
  assert.equal(target.querySelector("[data-a2ui-validation-state=invalid]"), null);
});

test("keeps built-in datetime-local conversion without a custom resolver", () => {
  const created = createBasicWebRuntime();
  assert.ok(created.ok);
  if (!created.ok) return;
  const surfaceId = "default-datetime";
  assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId, catalogId: created.value.catalogId } }).ok, true);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId, components: [{ id: "root", component: "DateTimeInput", value: { path: "/value" }, enableDate: true, enableTime: true }] } }).ok, true);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", updateDataModel: { surfaceId, value: { value: "2032-01-01T00:00:00.000Z" } } }).ok, true);
  const { target } = dom();
  assert.equal(created.value.mount({ surfaceId, target }).ok, true);
  const input = target.querySelector("input") as HTMLInputElement;
  input.value = "2032-03-14T02:30";
  input.dispatchEvent(new input.ownerDocument.defaultView!.Event("change"));
  assert.equal((created.value.runtime.getSurface(surfaceId)?.dataModel as JsonObject).value, new Date("2032-03-14T02:30").toISOString());
});

test("preserves deny-by-default media behavior", () => {
  const created = createBasicWebRuntime();
  assert.ok(created.ok);
  if (!created.ok) return;
  const surface = created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: "media", catalogId: created.value.catalogId } });
  assert.equal(surface.ok, true);
  const update = created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: "media", components: [{ id: "root", component: "Image", url: "https://invalid.example/image.png" }] } });
  assert.equal(update.ok, true);
  const { target } = dom();
  const mounted = created.value.mount({ surfaceId: "media", target });
  assert.ok(mounted.ok);
  assert.equal(target.querySelector("img")?.getAttribute("src"), null);
});

test("passes explicit caller function registrations to Core", () => {
  const created = createBasicWebRuntime({
    runtime: {
      functions: [{ catalogId: A2UI_V091_BASIC_CATALOG_ID, name: "formatString", effect: "pure", implementation: ({ value }) => `trusted:${String(value)}` }],
    },
  });
  assert.ok(created.ok);
  if (!created.ok) return;
  const surfaceId = "trusted-function";
  assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId, catalogId: created.value.catalogId } }).ok, true);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId, components: [{ id: "root", component: "Text", text: { call: "formatString", args: { value: "Ada" } } }] } }).ok, true);
  const { target } = dom();
  assert.equal(created.value.mount({ surfaceId, target }).ok, true);
  assert.equal(target.textContent, "trusted:Ada");
});

test("preserves Core function configuration failures unchanged", () => {
  const implementation = () => "one";
  const created = createBasicWebRuntime({
    runtime: {
      functions: [
        { catalogId: A2UI_V091_BASIC_CATALOG_ID, name: "formatString", effect: "pure", implementation },
        { catalogId: A2UI_V091_BASIC_CATALOG_ID, name: "formatString", effect: "pure", implementation },
      ],
    },
  });
  assert.equal(created.ok, false);
  if (created.ok) return;
  assert.equal(created.error.code, "FUNCTION_CONFIGURATION_FAILED");
  assert.equal(created.error.functionError.code, "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED");
});

test("does not install Basic functions or Web openUrl implicitly", () => {
  const created = createBasicWebRuntime();
  assert.ok(created.ok);
  if (!created.ok) return;
  assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: "fn", catalogId: created.value.catalogId } }).ok, true);
  const result = created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: "fn", components: [{ id: "root", component: "Text", text: { call: "required", args: { value: "x" } } }] } });
  assert.equal(result.ok, true);
  const resolved = created.value.runtime.resolveSurface("fn");
  assert.ok(resolved.ok);
  if (resolved.ok) assert.equal(resolved.value.issues.properties.some((issue) => issue.code === "FUNCTION_EVALUATION_FAILED"), true);
});

test("supports explicit additional catalogs and renderers", () => {
  const custom = customCatalog("custom");
  const created = createBasicWebRuntime({
    additionalCatalogs: [custom],
    additionalRenderers: [{ catalogId: "custom", component: "Custom", render: ({ document }) => { const node = document.createElement("span"); node.setAttribute("data-custom-renderer", "true"); node.textContent = "Custom output"; return node; } }],
  });
  assert.ok(created.ok);
  if (!created.ok) return;
  assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: "custom", catalogId: "custom" } }).ok, true);
  assert.equal(created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: "custom", components: [{ id: "root", component: "Custom" }] } }).ok, true);
  const { target } = dom();
  assert.equal(created.value.mount({ surfaceId: "custom", target }).ok, true);
  assert.equal(target.querySelector("[data-custom-renderer]")?.textContent, "Custom output");
});

test("returns duplicate renderer configuration as a typed creation error", () => {
  const created = createBasicWebRuntime({ additionalRenderers: [{ catalogId: A2UI_V091_BASIC_CATALOG_ID, component: "Text", render: ({ document }) => document.createElement("div") }] });
  assert.equal(created.ok, false);
  if (created.ok) return;
  assert.equal(created.error.code, "RENDERER_CONFIGURATION_FAILED");
  assert.ok(created.error.rendererError instanceof RendererRegistryConfigurationError);
  assert.equal(created.error.rendererError.catalogId, A2UI_V091_BASIC_CATALOG_ID);
  assert.equal(created.error.rendererError.component, "Text");
});

test("preserves Core catalog configuration failures", () => {
  const created = createBasicWebRuntime({ additionalCatalogs: [createBasicCatalogV091Registration()] });
  assert.equal(created.ok, false);
  if (created.ok) return;
  assert.equal(created.error.code, "CATALOG_CONFIGURATION_FAILED");
});

test("one facade can mount multiple independent surfaces", () => {
  const created = createBasicWebRuntime();
  assert.ok(created.ok);
  if (!created.ok) return;
  for (const input of message("one", created.value.catalogId, "One")) assert.equal(created.value.runtime.process(input).ok, true);
  for (const input of message("two", created.value.catalogId, "Two")) assert.equal(created.value.runtime.process(input).ok, true);
  const first = dom(); const second = dom();
  assert.equal(created.value.mount({ surfaceId: "one", target: first.target }).ok, true);
  assert.equal(created.value.mount({ surfaceId: "two", target: second.target }).ok, true);
  assert.equal(first.target.textContent, "One");
  assert.equal(second.target.textContent, "Two");
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { CatalogRegistry } from "../catalog/index.js";
import type { JsonObject } from "../protocol/index.js";
import { SurfaceStore } from "../surfaces/index.js";
import { ComponentTreeResolver } from "./ComponentTreeResolver.js";

const componentIdRef = "common_types.json#/$defs/ComponentId";
const childListRef = "common_types.json#/$defs/ChildList";

function component(name: string, structural: JsonObject = {}, values: JsonObject = {}): JsonObject {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      component: { const: name },
      url: { type: "string" },
      ...structural,
      ...values,
    },
    required: ["id", "component"],
    additionalProperties: false,
  };
}

function catalog(catalogId: string, components: JsonObject): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://example.test/${catalogId}/catalog.json`,
    catalogId,
    components,
    $defs: {
      theme: { type: "object" },
      commonTypes: {
        $id: "common_types.json",
        $defs: {
          ComponentId: { type: "string" },
          ChildList: {
            oneOf: [
              { type: "array", items: { $ref: "#/$defs/ComponentId" } },
              {
                type: "object",
                properties: { path: { type: "string" }, componentId: { $ref: "#/$defs/ComponentId" } },
                required: ["path", "componentId"],
                additionalProperties: false,
              },
            ],
          },
        },
      },
    },
  };
}

function setup(catalogId = "custom", components?: JsonObject) {
  const schemas = components ?? {
    Box: component("Box", { slot: { $ref: componentIdRef }, sections: { $ref: childListRef } }),
    Leaf: component("Leaf"),
  };
  const registry = new CatalogRegistry();
  const registration = registry.register({ catalogId, schema: catalog(catalogId, schemas) });
  assert.equal(registration.ok, true);
  const store = new SurfaceStore();
  assert.equal(store.create({ surfaceId: "surface", catalogId }).ok, true);
  return { registry, store, resolver: new ComponentTreeResolver(registry) };
}

function snapshot(store: SurfaceStore) {
  const value = store.get("surface");
  assert.ok(value);
  return value;
}

function resolved(result: ReturnType<ComponentTreeResolver["resolve"]>) {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

test("discovers unusual structural names defensively and ignores ordinary strings", () => {
  const { registry, store, resolver } = setup();
  const structure = registry.getComponentStructure("custom", "Box");
  assert.deepEqual(structure, { ok: true, value: { singleChildFields: ["slot"], childListFields: ["sections"] } });
  if (structure.ok) structure.value.singleChildFields.push("url");
  assert.deepEqual(registry.getComponentStructure("custom", "Box"), structure.ok
    ? { ok: true, value: { singleChildFields: ["slot"], childListFields: ["sections"] } }
    : structure);

  store.updateComponents("surface", [
    { id: "root", component: "Box", slot: "child", sections: [], url: "child" },
    { id: "child", component: "Leaf" },
  ]);
  const tree = resolved(resolver.resolve(snapshot(store)));
  assert.equal(tree.root?.relationships.length, 2);
  assert.equal(tree.root?.relationships.some(({ property }) => property === "url"), false);
});

test("resolves root-only and single-child trees", () => {
  const { store, resolver } = setup();
  store.updateComponents("surface", [{ id: "root", component: "Leaf" }]);
  assert.deepEqual(resolved(resolver.resolve(snapshot(store))).root?.relationships, []);
  store.updateComponents("surface", [
    { id: "root", component: "Box", slot: "child", sections: [] },
    { id: "child", component: "Leaf" },
  ]);
  const relationship = resolved(resolver.resolve(snapshot(store))).root?.relationships[0];
  assert.equal(relationship?.kind, "single");
  if (relationship?.kind === "single") assert.equal(relationship.node?.id, "child");
});

test("missing root is successful progressive state and appears on a later resolution", () => {
  const { store, resolver } = setup();
  store.updateComponents("surface", [{ id: "title", component: "Leaf" }]);
  assert.deepEqual(resolved(resolver.resolve(snapshot(store))), { ready: false, issues: [] });
  store.updateComponents("surface", [{ id: "root", component: "Leaf" }]);
  assert.equal(resolved(resolver.resolve(snapshot(store))).ready, true);
});

test("missing static references remain represented and recover on the next resolution", () => {
  const { store, resolver } = setup();
  store.updateComponents("surface", [{ id: "root", component: "Box", slot: "later", sections: [] }]);
  const incomplete = resolved(resolver.resolve(snapshot(store)));
  assert.equal(incomplete.root?.relationships[0]?.kind, "single");
  assert.deepEqual(incomplete.issues.map(({ code }) => code), ["MISSING_COMPONENT_REFERENCE"]);
  store.updateComponents("surface", [{ id: "later", component: "Leaf" }]);
  const complete = resolved(resolver.resolve(snapshot(store)));
  assert.deepEqual(complete.issues, []);
});

test("preserves static child ordering and multiple structural properties", () => {
  const schemas = {
    Layout: component("Layout", {
      trigger: { $ref: componentIdRef },
      content: { $ref: componentIdRef },
      sections: { $ref: childListRef },
    }),
    Leaf: component("Leaf"),
  };
  const { store, resolver } = setup("custom", schemas);
  store.updateComponents("surface", [
    { id: "root", component: "Layout", trigger: "a", content: "b", sections: ["a", "b", "c"] },
    ...["a", "b", "c"].map((id) => ({ id, component: "Leaf" })),
  ]);
  const relationships = resolved(resolver.resolve(snapshot(store))).root?.relationships ?? [];
  assert.deepEqual(relationships.map(({ property }) => property), ["trigger", "content", "sections"]);
  const list = relationships[2];
  assert.equal(list?.kind, "list");
  if (list?.kind === "list") assert.deepEqual(list.nodes.map(({ id }) => id), ["a", "b", "c"]);
});

test("records dynamic templates without instantiation and reports a missing template", () => {
  const { store, resolver } = setup();
  store.updateComponents("surface", [{
    id: "root", component: "Box", slot: "leaf", sections: { path: "/items", componentId: "template" },
  }, { id: "leaf", component: "Leaf" }]);
  const missing = resolved(resolver.resolve(snapshot(store)));
  assert.deepEqual(missing.root?.relationships[1], {
    kind: "template", property: "sections", path: "/items", componentId: "template",
  });
  assert.equal(missing.issues[0]?.code, "MISSING_COMPONENT_REFERENCE");
  store.updateComponents("surface", [{ id: "template", component: "Leaf" }]);
  assert.deepEqual(resolved(resolver.resolve(snapshot(store))).issues, []);
});

test("terminates self and multi-node cycles", () => {
  const { store, resolver } = setup();
  store.updateComponents("surface", [{ id: "root", component: "Box", slot: "root", sections: [] }]);
  assert.equal(resolved(resolver.resolve(snapshot(store))).issues[0]?.code, "CIRCULAR_COMPONENT_REFERENCE");
  store.updateComponents("surface", [
    { id: "root", component: "Box", slot: "b", sections: [] },
    { id: "b", component: "Box", slot: "root", sections: [] },
  ]);
  assert.equal(resolved(resolver.resolve(snapshot(store))).issues[0]?.code, "CIRCULAR_COMPONENT_REFERENCE");
});

test("allows reuse across separate branches without reporting a cycle", () => {
  const { store, resolver } = setup();
  store.updateComponents("surface", [
    { id: "root", component: "Box", slot: "left", sections: ["right"] },
    { id: "left", component: "Box", slot: "shared", sections: [] },
    { id: "right", component: "Box", slot: "shared", sections: [] },
    { id: "shared", component: "Leaf" },
  ]);
  assert.deepEqual(resolved(resolver.resolve(snapshot(store))).issues, []);
});

test("uses only the surface catalog and fails defensively for unknown component metadata", () => {
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "a", schema: catalog("a", { Same: component("Same") }) }).ok, true);
  assert.equal(registry.register({ catalogId: "b", schema: catalog("b", {
    Same: component("Same", { slot: { $ref: componentIdRef } }), Leaf: component("Leaf"),
  }) }).ok, true);
  const resolver = new ComponentTreeResolver(registry);
  const surface = {
    surfaceId: "s", catalogId: "a", sendDataModel: false, dataModel: {},
    components: { root: { id: "root", component: "Same", slot: "missing" } },
  };
  assert.deepEqual(resolved(resolver.resolve(surface)).root?.relationships, []);
  surface.components.root.component = "Unknown";
  const failure = resolver.resolve(surface);
  assert.equal(!failure.ok && failure.error.code, "COMPONENT_STRUCTURE_NOT_FOUND");
});

test("returns a fully defensive tree and issue snapshot", () => {
  const { store, resolver } = setup();
  store.updateComponents("surface", [{ id: "root", component: "Box", slot: "missing", sections: [] }]);
  const first = resolved(resolver.resolve(snapshot(store)));
  assert.ok(first.root);
  first.root.definition.slot = "changed";
  first.root.relationships.length = 0;
  first.issues[0]!.targetId = "changed";
  const second = resolved(resolver.resolve(snapshot(store)));
  assert.equal(second.root?.definition.slot, "missing");
  assert.equal(second.root?.relationships.length, 2);
  assert.equal(second.issues[0]?.targetId, "missing");
});

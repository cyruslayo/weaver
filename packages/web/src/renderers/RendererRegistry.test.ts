import assert from "node:assert/strict";
import { test } from "node:test";
import { RendererRegistry } from "./RendererRegistry.js";
import { RendererRegistryConfigurationError } from "./errors.js";

const render = ({ document }: { document: Document }) => document.createTextNode("test");

test("registry is immutable, catalog-isolated, and defensively listed", () => {
  const registry = new RendererRegistry([
    { catalogId: "catalog-a", component: "Text", render },
    { catalogId: "catalog-b", component: "Text", render },
  ]);
  assert.equal(registry.get("catalog-a", "Text"), render);
  assert.equal(registry.has("catalog-b", "Text"), true);
  assert.equal(registry.get("catalog-c", "Text"), undefined);
  const listed = registry.list();
  listed[0]!.catalogId = "changed";
  assert.equal(registry.list()[0]?.catalogId, "catalog-a");
  assert.equal("register" in registry, false);
});

test("duplicate renderer registration fails deterministically", () => {
  assert.throws(
    () => new RendererRegistry([
      { catalogId: "catalog-a", component: "Text", render },
      { catalogId: "catalog-a", component: "Text", render },
    ]),
    (error) => error instanceof RendererRegistryConfigurationError
      && error.code === "RENDERER_ALREADY_REGISTERED"
      && error.catalogId === "catalog-a"
      && error.component === "Text",
  );
});

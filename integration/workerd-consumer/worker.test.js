import { createWeaverRuntime } from "@weaver/core";
import { describe, expect, it } from "vitest";

const catalog = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  catalogId: "worker-test",
  components: {
    Text: {
      type: "object",
      properties: { id: { type: "string" }, component: { const: "Text" }, text: { type: "string" } },
      required: ["id", "component", "text"],
      additionalProperties: false,
    },
  },
  $defs: { theme: { type: "object" } },
};

async function fetch() {
  // Creation and trusted catalog registration deliberately happen after request execution begins.
  const made = createWeaverRuntime({ catalogs: [{ catalogId: "worker-test", schema: catalog }] });
  if (!made.ok) return Response.json({ stage: "registration", error: made.error }, { status: 500 });
  const runtime = made.value;
  const created = runtime.process({ version: "v0.9.1", createSurface: { surfaceId: "s", catalogId: "worker-test" } });
  const valid = runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Text", text: "Worker safe" }] } });
  const invalid = runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: "s", components: [{ id: "bad", component: "Text", text: 42 }] } });
  return Response.json({ registered: true, created: created.ok, valid: valid.ok, invalidRejected: !invalid.ok, invalid });
}

describe("packed Core in workerd", () => {
  it("registers a runtime catalog and validates valid and invalid A2UI during a request", async () => {
    const response = await fetch();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ registered: true, created: true, valid: true, invalidRejected: true });
    expect(result.invalid.error.code).toBe("CATALOG_REGISTRY_ERROR");
    expect(result.invalid.error.catalogError.code).toBe("COMPONENT_VALIDATION_FAILED");
  });
});

import { createWeaverRuntime, generateA2UIV091Prompt } from "@cylayo/weaver-core";
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
  // Prompt generation is pure, but it builds a scratch CatalogRegistry, so it must run inside workerd too.
  const prompt = generateA2UIV091Prompt({ catalogs: [{ catalogId: "worker-test", schema: catalog }] });
  const promptResult = prompt.ok
    ? { ok: true, containsText: prompt.value.text.includes("Text") }
    : { ok: false, error: prompt.error };
  return Response.json({ registered: true, created: created.ok, valid: valid.ok, invalidRejected: !invalid.ok, invalid, prompt: promptResult });
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

  it("generates an A2UI v0.9.1 prompt from a runtime catalog during a request", async () => {
    const response = await fetch();
    const result = await response.json();
    expect(result.prompt).toEqual({ ok: true, containsText: true });
  });
});

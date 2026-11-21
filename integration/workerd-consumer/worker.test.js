import { createWeaverRuntime, generateA2UIV10Prompt } from "@cylayo/weaver-core";
import { describe, expect, it } from "vitest";

// A v1.0 catalog. The Unicode-named component and id exercise the UAX #31 identifier pattern,
// which Core compiles with the u flag: \p{XID_Start} and \p{XID_Continue} must work inside workerd.
const catalog = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  protocolVersion: "1.0",
  catalogId: "worker-test",
  components: {
    Text: {
      type: "object",
      properties: { component: { const: "Text" }, text: { type: "string" } },
      required: ["component", "text"],
      additionalProperties: false,
    },
    Ünïcode: {
      type: "object",
      properties: { component: { const: "Ünïcode" }, label: { type: "string" } },
      required: ["component", "label"],
      additionalProperties: false,
    },
  },
};

async function fetch() {
  // Creation and trusted catalog registration deliberately happen after request execution begins.
  const made = createWeaverRuntime({ catalogs: [{ catalogId: "worker-test", schema: catalog }] });
  if (!made.ok) return Response.json({ stage: "registration", error: made.error }, { status: 500 });
  const runtime = made.value;
  const created = runtime.process({ version: "1.0", createSurface: { surfaceId: "s", catalogId: "worker-test" } });
  const valid = runtime.process({ version: "1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Text", text: "Worker safe" }] } });
  const unicode = runtime.process({ version: "1.0", updateComponents: { surfaceId: "s", components: [{ id: "根", component: "Ünïcode", label: "Unicode" }] } });
  const invalid = runtime.process({ version: "1.0", updateComponents: { surfaceId: "s", components: [{ id: "bad", component: "Text", text: 42 }] } });
  // Prompt generation is pure, but it builds a scratch CatalogRegistry, so it must run inside workerd too.
  const prompt = generateA2UIV10Prompt({ catalogs: [{ catalogId: "worker-test", schema: catalog }] });
  const promptResult = prompt.ok
    ? { ok: true, containsText: prompt.value.text.includes("Text") }
    : { ok: false, error: prompt.error };
  return Response.json({
    registered: true,
    created: created.ok,
    valid: valid.ok,
    unicodeAccepted: unicode.ok,
    invalidRejected: !invalid.ok,
    invalid,
    prompt: promptResult,
    identifierPattern: new RegExp("^[\\p{XID_Start}_][\\p{XID_Continue}]*$", "u").test("根") && !new RegExp("^[\\p{XID_Start}_][\\p{XID_Continue}]*$", "u").test("1bad"),
  });
}

describe("packed Core in workerd", () => {
  it("registers a runtime catalog and validates valid and invalid A2UI during a request", async () => {
    const response = await fetch();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ registered: true, created: true, valid: true, unicodeAccepted: true, invalidRejected: true, identifierPattern: true });
    expect(result.invalid.error.code).toBe("CATALOG_REGISTRY_ERROR");
    expect(result.invalid.error.catalogError.code).toBe("COMPONENT_VALIDATION_FAILED");
  });

  it("generates an A2UI v1.0 prompt from a runtime catalog during a request", async () => {
    const response = await fetch();
    const result = await response.json();
    expect(result.prompt).toEqual({ ok: true, containsText: true });
  });
});

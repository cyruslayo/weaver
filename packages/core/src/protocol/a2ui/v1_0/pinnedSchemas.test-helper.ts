import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { JsonObject } from "./types.js";

/**
 * Loads the pinned upstream A2UI v1.0 JSON schemas from src. They are not copied
 * to dist, so the path is resolved from the compiled test module (dist/.../v1_0/).
 */
const PINNED_ROOT = new URL("../../../../src/protocol/a2ui/v1_0/", import.meta.url);

function loadPinned(relativePath: string): JsonObject {
  return JSON.parse(readFileSync(new URL(relativePath, PINNED_ROOT), "utf8")) as JsonObject;
}

const ajv = new Ajv2020({ strict: false, validateFormats: false });
const commonTypes = loadPinned("inbound/fixtures/common_types.json");
ajv.addSchema(commonTypes);
ajv.addSchema(loadPinned("inbound/fixtures/catalog_definition.json"));
// The upstream agent schema references catalog.json by its v1.0 root URL, not the
// catalogs/basic path it ships with, so the basic catalog is re-identified here.
ajv.addSchema({
  ...loadPinned("inbound/fixtures/catalog.json"),
  $id: "https://a2ui.org/specification/v1_0/catalog.json",
});

/** Validates an agent-to-renderer message against the pinned upstream schema. */
export const validatePinnedAgentMessage = ajv.compile(loadPinned("inbound/fixtures/agent_to_renderer.json"));
/** Validates a renderer-to-agent event against the pinned upstream schema. */
export const validatePinnedRendererEvent = ajv.compile(loadPinned("outbound/fixtures/renderer_to_agent.json"));
/** Validates a renderer capabilities object against the pinned upstream schema. */
export const validatePinnedRendererCapabilities = ajv.compile(loadPinned("outbound/fixtures/renderer_capabilities.json"));
/** Validates a renderer data-model payload against the pinned upstream schema. */
export const validatePinnedRendererDataModel = ajv.compile(loadPinned("outbound/fixtures/renderer_data_model.json"));

export function formatAjvErrors(errors: readonly { instancePath: string; message?: string }[] | null | undefined): string {
  return JSON.stringify((errors ?? []).map((error) => `${error.instancePath} ${error.message ?? ""}`));
}

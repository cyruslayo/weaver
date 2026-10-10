const [{ Window }, core, web, mcp] = await Promise.all([
  import("happy-dom"),
  import("@cylayo/weaver-core"),
  import("@cylayo/weaver-web"),
  import("@cylayo/weaver-mcp"),
]);

if (core.WEAVER_CORE_VERSION !== "0.3.0") throw new Error("Unexpected Core version");
if (typeof web.RendererRegistry !== "function") throw new Error("Web root export unavailable");
if (typeof mcp.createA2UIMcpClientBridge !== "function") throw new Error("MCP root export unavailable");

const window = new Window();
const document = window.document;
let modelValue = "2032-01-01T00:00:00.000Z";
let rawSeen;
let decision = { status: "reject", message: "Choose another time" };
const registration = web.createBasicCatalogRendererRegistrations({
  catalogId: "basic",
  dateTimeInputLocalValueResolver: (request) => { rawSeen = request.rawValue; return decision; },
}).find(({ component }) => component === "DateTimeInput");
const node = registration.render({
  document, surfaceId: "packed-surface", catalogId: "basic",
  instance: { sourceComponentId: "packed-input", component: "DateTimeInput", scopePath: "/", properties: {}, relationships: [], unresolved: [] },
  properties: { enableDate: true, enableTime: true, value: modelValue }, relationships: [],
  interactions: {
    writeInput: (_property, value) => { modelValue = value; return { ok: true, value: { surfaceId: "packed-surface", sourceComponentId: "packed-input", property: "value", path: "/value", value } }; },
    dispatchAction: () => ({ ok: false, error: { code: "STALE_RENDER_INTERACTION" } }), getLocalState: (_key, fallback) => fallback,
    setLocalState: () => ({ ok: true }), registerControl: () => {},
  },
});
const input = node.querySelector("input");
input.value = "2032-03-14T02:30"; input.dispatchEvent(new window.Event("change"));
if (rawSeen !== "2032-03-14T02:30" || modelValue !== "2032-01-01T00:00:00.000Z") throw new Error("Packed resolver reject proof failed");
decision = { status: "accept", value: "2032-03-14T10:30:00.000Z" };
input.value = "2032-03-14T03:30"; input.dispatchEvent(new window.Event("change"));
if (rawSeen !== "2032-03-14T03:30" || modelValue !== "2032-03-14T10:30:00.000Z") throw new Error("Packed resolver accept proof failed");
console.log("tarball runtime imports and packed DateTimeInput resolver proof: core, web, mcp OK");

// Value exports added in 0.3.0 (and the long-standing ones they build on). A missing name fails here, by name.
const requiredExports = {
  core: [
    "A2UI_V091_BASIC_PROMPT_EXAMPLES", "createBasicCatalogV091Registration", "createWeaverRuntime",
    "createWeaverTraceRecorder", "defineCatalog", "describeWeaverError", "generateA2UIV091Prompt",
    "parseWeaverTrace", "replayWeaverTrace", "WEAVER_TRACE_FORMAT", "WEAVER_TRACE_REPLAY_INVALID_INPUT",
  ],
  web: ["describeWebRenderError", "RendererRegistry"],
  mcp: ["createA2UIMcpClientBridge"],
};
for (const [label, mod] of [["core", core], ["web", web], ["mcp", mcp]]) {
  for (const name of requiredExports[label]) {
    if (!(name in mod)) throw new Error(`Packed @cylayo/weaver-${label} is missing export ${name}`);
  }
}

// Prompt generation: a Basic prompt is produced, is deterministic, and an empty catalog list is rejected by code.
const promptOptions = { catalogs: [core.createBasicCatalogV091Registration()], examples: core.A2UI_V091_BASIC_PROMPT_EXAMPLES };
const prompt = core.generateA2UIV091Prompt(promptOptions);
if (!prompt.ok) throw new Error(`Packed prompt generation failed: ${prompt.error.code}`);
if (!prompt.value.text.includes("## Components")) throw new Error("Packed prompt has no Components section");
const promptAgain = core.generateA2UIV091Prompt(promptOptions);
if (!promptAgain.ok || promptAgain.value.text !== prompt.value.text) throw new Error("Packed prompt generation is not deterministic");
const noCatalogs = core.generateA2UIV091Prompt({ catalogs: [] });
if (noCatalogs.ok || noCatalogs.error.code !== "CATALOG_INVALID") throw new Error("Packed prompt generator did not reject an empty catalog list");

// Trace: record a Basic example through the observer, parse the JSON round trip, and replay it with no divergence.
const recorder = core.createWeaverTraceRecorder({ maxEntries: 100 });
const recordedRuntime = core.createWeaverRuntime({ catalogs: [core.createBasicCatalogV091Registration()], observer: recorder.observer });
if (!recordedRuntime.ok) throw new Error("Packed recording runtime was not created");
const exampleMessages = core.A2UI_V091_BASIC_PROMPT_EXAMPLES[0].messages;
recordedRuntime.value.processMany(exampleMessages);
const trace = core.parseWeaverTrace(JSON.parse(JSON.stringify(recorder.getTrace())));
if (!trace.ok) throw new Error(`Packed trace did not parse: ${trace.error.code}`);
if (trace.value.format !== core.WEAVER_TRACE_FORMAT || trace.value.entries.length !== exampleMessages.length) throw new Error("Packed trace has the wrong shape");
const replayRuntime = core.createWeaverRuntime({ catalogs: [core.createBasicCatalogV091Registration()] });
if (!replayRuntime.ok) throw new Error("Packed replay runtime was not created");
const replay = core.replayWeaverTrace(trace.value, { runtime: replayRuntime.value });
if (replay.steps.length !== exampleMessages.length || replay.steps.some((step) => step.diverged)) throw new Error("Packed trace replay diverged");
const malformed = core.parseWeaverTrace({ format: "weaver-trace", version: 2, truncated: false, entries: [] });
if (malformed.ok || malformed.error.code !== "UNSUPPORTED_VERSION") throw new Error("Packed trace parser accepted an unsupported version");

// Error descriptions: a Core decode error and a Web render error both come back with their codes.
const coreDescription = core.describeWeaverError({ code: "INVALID_JSON", frame: 7 });
if (coreDescription.code !== "INVALID_JSON" || coreDescription.frame !== 7 || coreDescription.severity !== "error") throw new Error("Packed describeWeaverError output is wrong");
const webDescription = web.describeWebRenderError({ code: "STALE_RENDER_INTERACTION" });
if (webDescription.code !== "STALE_RENDER_INTERACTION" || webDescription.severity !== "error") throw new Error("Packed describeWebRenderError output is wrong");

console.log("packed 0.3.0 exports: prompt generation, observer trace record and replay, error descriptions OK");

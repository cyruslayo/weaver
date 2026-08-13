const [{ Window }, core, web, mcp] = await Promise.all([
  import("happy-dom"),
  import("@weaver/core"),
  import("@weaver/web"),
  import("@weaver/mcp"),
]);

if (core.WEAVER_CORE_VERSION !== "0.1.2") throw new Error("Unexpected Core version");
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

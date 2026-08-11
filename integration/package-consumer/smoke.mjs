const [core, web, mcp] = await Promise.all([
  import("@weaver/core"),
  import("@weaver/web"),
  import("@weaver/mcp"),
]);

if (core.WEAVER_CORE_VERSION !== "0.1.1") throw new Error("Unexpected Core version");
if (typeof web.RendererRegistry !== "function") throw new Error("Web root export unavailable");
if (typeof mcp.createA2UIMcpClientBridge !== "function") throw new Error("MCP root export unavailable");
console.log("tarball runtime imports: core, web, mcp OK");

import { startReferenceA2UIHttpSseServer } from "./reference-server.mjs";

const server = await startReferenceA2UIHttpSseServer({
  host: "127.0.0.1", port: Number(process.env.PORT ?? 8787),
  onStreamOpen(capabilities) {
    console.log("A2UI stream connected", capabilities);
    setTimeout(() => void server.sendA2UI({ version: "v0.9.1", createSurface: { surfaceId: "example", catalogId: "basic" } }), 0);
  },
  onClientMessage(received) { console.log("A2UI client message", received.message); },
});
console.log(`Reference server: ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await server.close(); process.exitCode = 0; });

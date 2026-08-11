import { startReferenceA2UIHttpSseServer } from "./reference-server.mjs";

const server = await startReferenceA2UIHttpSseServer({
  host: "127.0.0.1", port: Number(process.env.PORT ?? 8787),
  onStreamOpen(capabilities, lastEventId) {
    console.log(lastEventId === undefined ? "A2UI stream connected" : `A2UI stream resumed after event ${lastEventId}`, capabilities);
    if (lastEventId === undefined) setTimeout(async () => {
      const result = await server.sendA2UI({ version: "v0.9.1", createSurface: { surfaceId: "example", catalogId: "basic" } });
      if (result.ok) console.log(`A2UI event ${result.eventId} emitted`);
    }, 0);
  },
  onClientMessage(received) { console.log("A2UI client message", received.message); },
});
console.log(`Reference server: ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await server.close(); process.exitCode = 0; });

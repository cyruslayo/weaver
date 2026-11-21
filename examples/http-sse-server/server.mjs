import { startReferenceA2UIHttpSseServer } from "./reference-server.mjs";

const server = await startReferenceA2UIHttpSseServer({
  host: "127.0.0.1", port: Number(process.env.PORT ?? 8787),
  onStreamOpen(capabilities, lastEventId) {
    console.log(lastEventId === undefined ? "A2UI stream connected" : `A2UI stream resumed after event ${lastEventId}`, capabilities);
    if (lastEventId === undefined) setTimeout(async () => {
      const result = await server.sendA2UI({ version: "1.0", createSurface: { surfaceId: "example", catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json" } });
      if (result.ok) console.log(`A2UI event ${result.eventId} emitted`);
    }, 0);
  },
  onClientMessage(received) {
    console.log("A2UI client message", received.message);
    // Demo only: a callAgentFunction is answered with its own arguments. A real host runs its own authorized function here.
    const call = received.message.callAgentFunction;
    if (call !== undefined) setTimeout(async () => {
      const result = await server.sendA2UI({ version: "1.0", agentFunctionResponse: { functionCallId: call.functionCallId, value: call.callFunction?.args ?? null } });
      if (result.ok) console.log(`Answered call ${call.functionCallId} with event ${result.eventId}`);
    }, 0);
  },
});
console.log(`Reference server: ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await server.close(); process.exitCode = 0; });

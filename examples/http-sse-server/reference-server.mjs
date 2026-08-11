import { createServer } from "node:http";
import { once } from "node:events";

const BODY_LIMIT = 1_048_576, DEFAULT_REPLAY_CAPACITY = 128;
const object = value => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const mediaTypes = value => (value ?? "").split(",").map(part => part.trim().split(";", 1)[0].trim().toLowerCase()).filter(Boolean);
const fail = (response, status) => response.writeHead(status).end();
async function readJson(request) { const chunks = []; let size = 0; try { for await (const chunk of request) { size += chunk.length; if (size > BODY_LIMIT) { request.resume(); return { status: 413 }; } chunks.push(chunk); } return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")) }; } catch { return { status: 400 }; } }
const metadata = (value, send) => object(value) && exact(value, send ? ["a2uiClientCapabilities", "a2uiClientDataModel"] : ["a2uiClientCapabilities"]) && object(value.a2uiClientCapabilities);
const frame = entry => `event: a2ui\nid: ${entry.id}\ndata: ${entry.payload}\n\n`;
const write = async (response, value) => { if (!response.write(value)) await once(response, "drain"); };

/** Starts one loopback-only, single-trusted-peer reference server. */
export async function startReferenceA2UIHttpSseServer(options = {}) {
  const capacity = options.replayCapacity ?? DEFAULT_REPLAY_CAPACITY; if (!Number.isFinite(capacity) || !Number.isInteger(capacity) || capacity <= 0) throw new RangeError("replayCapacity must be a finite positive integer");
  let active, connected = false, nextId = 1, writeTail = Promise.resolve(); const history = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path !== "/a2ui/stream" && path !== "/a2ui/send") return fail(response, 404);
    if (request.method !== "POST") { response.setHeader("Allow", "POST"); return fail(response, 405); }
    if (!mediaTypes(request.headers["content-type"]).includes("application/json")) return fail(response, 400);
    if (path === "/a2ui/stream" && !mediaTypes(request.headers.accept).includes("text/event-stream")) return fail(response, 400);
    if (path === "/a2ui/stream" && active && !active.destroyed && !active.writableEnded) return fail(response, 409);
    const readResult = await readJson(request); if (readResult.status) return fail(response, readResult.status); const body = readResult.value; if (!object(body)) return fail(response, 400);
    if (path === "/a2ui/stream") {
      if (!exact(body, ["metadata"]) || !metadata(body.metadata, false)) return fail(response, 400);
      const cursor = request.headers["last-event-id"]; if (Array.isArray(cursor) || (cursor !== undefined && !/^(0|[1-9]\d*)$/.test(cursor))) return fail(response, 400);
      let replay = []; if (cursor !== undefined) { const number = Number(cursor), latest = nextId - 1, oldest = history.length ? Number(history[0].id) : nextId; if (!Number.isSafeInteger(number) || number > latest || number < oldest - 1) return fail(response, 410); replay = history.filter(entry => Number(entry.id) > number); }
      try { await options.onStreamOpen?.(structuredClone(body.metadata.a2uiClientCapabilities), cursor); } catch { return fail(response, 500); }
      active = response; connected = true; response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" }); response.flushHeaders(); response.write(": connected\n\n");
      writeTail = writeTail.then(async () => { for (const entry of replay) await write(response, frame(entry)); }); writeTail.catch(() => {});
      const release = () => { if (active === response) active = undefined; }; response.once("close", release); response.once("finish", release); return;
    }
    if (!exact(body, ["message", "metadata"]) || !object(body.message) || !metadata(body.metadata, true)) return fail(response, 400);
    const received = { message: structuredClone(body.message), capabilities: structuredClone(body.metadata.a2uiClientCapabilities) }; if ("a2uiClientDataModel" in body.metadata) received.clientDataModel = structuredClone(body.metadata.a2uiClientDataModel);
    try { await options.onClientMessage?.(received); } catch { return fail(response, 500); } response.writeHead(204).end();
  });
  const host = options.host ?? "127.0.0.1", port = options.port ?? 0; server.listen(port, host); await once(server, "listening"); const address = server.address(); if (!address || typeof address === "string") throw new Error("TCP bind failed"); const url = `http://${host}:${address.port}`;
  return { url, streamUrl: `${url}/a2ui/stream`, sendUrl: `${url}/a2ui/send`,
    async sendA2UI(value) { if (!connected) return { ok: false, error: "NO_ACTIVE_STREAM" }; let payload; try { payload = JSON.stringify(value); } catch { return { ok: false, error: "JSON_SERIALIZATION_FAILED" }; } if (payload === undefined) return { ok: false, error: "JSON_SERIALIZATION_FAILED" }; const entry = { id: String(nextId++), payload }; history.push(entry); if (history.length > capacity) history.shift(); const target = active; if (!target || target.destroyed || target.writableEnded) return { ok: true, eventId: entry.id, status: "buffered-for-resume" }; try { const pending = writeTail.then(() => write(target, frame(entry))); writeTail = pending; await pending; return { ok: true, eventId: entry.id, status: "sent" }; } catch { return { ok: false, error: target.destroyed || target.writableEnded ? "STREAM_CLOSED" : "WRITE_FAILED" }; } },
    closeStream() { active?.end(); }, async close() { active?.end(); if (server.listening) { server.close(); await once(server, "close"); } },
  };
}

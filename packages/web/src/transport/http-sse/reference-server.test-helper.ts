import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

const BODY_LIMIT = 1_048_576;
const DEFAULT_REPLAY_CAPACITY = 128;
type JsonObject = Record<string, unknown>;
type HistoryEntry = { id: string; payload: string };
export interface ReceivedClientMessage { message: JsonObject; capabilities: JsonObject; clientDataModel?: unknown }
export interface ReferenceServerOptions {
  replayCapacity?: number;
  onStreamOpen?(capabilities: JsonObject, resumeEventId?: string): void | Promise<void>;
  onClientMessage?(received: ReceivedClientMessage): void | Promise<void>;
}
export type SendResult = { ok: true; eventId: string; status: "sent" | "buffered-for-resume" } | { ok: false; error: "NO_ACTIVE_STREAM" | "STREAM_CLOSED" | "JSON_SERIALIZATION_FAILED" | "WRITE_FAILED" };
export interface ReferenceServer {
  url: string; streamUrl: string; sendUrl: string;
  sendA2UI(message: unknown): Promise<SendResult>;
  closeStream(): void;
  historySize(): number;
  close(): Promise<void>;
}

function mediaTypes(value: string | undefined): string[] { return (value ?? "").split(",").map(part => part.trim().split(";", 1)[0]!.trim().toLowerCase()).filter(Boolean); }
function object(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: JsonObject, allowed: readonly string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
async function jsonBody(request: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const chunks: Buffer[] = []; let size = 0;
  try { for await (const chunk of request) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > BODY_LIMIT) { request.resume(); return { ok: false, status: 413 }; } chunks.push(bytes); } return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown }; }
  catch { return { ok: false, status: 400 }; }
}
function fail(response: ServerResponse, status: number): void { response.writeHead(status).end(); }
function validMetadata(value: unknown, send: boolean): value is JsonObject { return object(value) && exact(value, send ? ["a2uiClientCapabilities", "a2uiClientDataModel"] : ["a2uiClientCapabilities"]) && object(value.a2uiClientCapabilities); }
function frame(entry: HistoryEntry): string { return `event: a2ui\nid: ${entry.id}\ndata: ${entry.payload}\n\n`; }
async function write(response: ServerResponse, value: string): Promise<void> { if (!response.write(value)) await once(response, "drain"); }

export async function startReferenceServer(options: ReferenceServerOptions = {}): Promise<ReferenceServer> {
  const capacity = options.replayCapacity ?? DEFAULT_REPLAY_CAPACITY;
  if (!Number.isFinite(capacity) || !Number.isInteger(capacity) || capacity <= 0) throw new RangeError("replayCapacity must be a finite positive integer");
  let active: ServerResponse | undefined; let connected = false; let nextId = 1; let writeTail = Promise.resolve(); const history: HistoryEntry[] = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path !== "/a2ui/stream" && path !== "/a2ui/send") { fail(response, 404); return; }
    if (request.method !== "POST") { response.setHeader("Allow", "POST"); fail(response, 405); return; }
    if (!mediaTypes(request.headers["content-type"]).includes("application/json")) { fail(response, 400); return; }
    if (path === "/a2ui/stream" && !mediaTypes(request.headers.accept).includes("text/event-stream")) { fail(response, 400); return; }
    if (path === "/a2ui/stream" && active !== undefined && !active.destroyed && !active.writableEnded) { fail(response, 409); return; }
    const body = await jsonBody(request); if (!body.ok) { fail(response, body.status); return; }
    if (!object(body.value)) { fail(response, 400); return; }
    if (path === "/a2ui/stream") {
      if (!exact(body.value, ["metadata"]) || !validMetadata(body.value.metadata, false)) { fail(response, 400); return; }
      const rawCursor = request.headers["last-event-id"];
      if (Array.isArray(rawCursor) || (rawCursor !== undefined && !/^(0|[1-9]\d*)$/u.test(rawCursor))) { fail(response, 400); return; }
      let replay: HistoryEntry[] = [];
      if (rawCursor !== undefined) {
        const cursor = Number(rawCursor); const latest = nextId - 1; const oldest = history.length === 0 ? nextId : Number(history[0]!.id);
        if (!Number.isSafeInteger(cursor) || cursor > latest || cursor < oldest - 1) { fail(response, 410); return; }
        replay = history.filter(entry => Number(entry.id) > cursor);
      }
      try { await options.onStreamOpen?.(structuredClone(body.value.metadata.a2uiClientCapabilities as JsonObject), rawCursor); }
      catch { fail(response, 500); return; }
      active = response; connected = true;
      response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" }); response.flushHeaders(); response.write(": connected\n\n");
      writeTail = writeTail.then(async () => { for (const entry of replay) await write(response, frame(entry)); });
      writeTail.catch(() => undefined);
      const release = () => { if (active === response) active = undefined; }; response.once("close", release); response.once("finish", release); return;
    }
    if (!exact(body.value, ["message", "metadata"]) || !object(body.value.message) || !validMetadata(body.value.metadata, true)) { fail(response, 400); return; }
    const received: ReceivedClientMessage = { message: structuredClone(body.value.message), capabilities: structuredClone(body.value.metadata.a2uiClientCapabilities as JsonObject) };
    if ("a2uiClientDataModel" in body.value.metadata) received.clientDataModel = structuredClone(body.value.metadata.a2uiClientDataModel);
    try { await options.onClientMessage?.(received); } catch { fail(response, 500); return; }
    response.writeHead(204).end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (address === null || typeof address === "string") throw new Error("Reference server did not bind TCP");
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url, streamUrl: `${url}/a2ui/stream`, sendUrl: `${url}/a2ui/send`,
    async sendA2UI(message) {
      if (!connected) return { ok: false, error: "NO_ACTIVE_STREAM" };
      let payload: string | undefined; try { payload = JSON.stringify(message); } catch { return { ok: false, error: "JSON_SERIALIZATION_FAILED" }; }
      if (payload === undefined) return { ok: false, error: "JSON_SERIALIZATION_FAILED" };
      const entry = { id: String(nextId++), payload }; history.push(entry); if (history.length > capacity) history.shift();
      const target = active;
      if (target === undefined || target.destroyed || target.writableEnded) return { ok: true, eventId: entry.id, status: "buffered-for-resume" };
      try { const pending = writeTail.then(() => write(target, frame(entry))); writeTail = pending; await pending; return { ok: true, eventId: entry.id, status: "sent" }; }
      catch { return { ok: false, error: target.destroyed || target.writableEnded ? "STREAM_CLOSED" : "WRITE_FAILED" }; }
    },
    closeStream() { active?.end(); }, historySize() { return history.length; },
    async close() { active?.end(); if (server.listening) { server.close(); await once(server, "close"); } },
  };
}

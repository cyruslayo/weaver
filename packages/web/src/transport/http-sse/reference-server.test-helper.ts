import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

const BODY_LIMIT = 1_048_576;
type JsonObject = Record<string, unknown>;
export interface ReceivedClientMessage { message: JsonObject; capabilities: JsonObject; clientDataModel?: unknown }
export interface ReferenceServerOptions {
  onStreamOpen?(capabilities: JsonObject): void | Promise<void>;
  onClientMessage?(received: ReceivedClientMessage): void | Promise<void>;
}
export type SendResult = { ok: true } | { ok: false; error: "NO_ACTIVE_STREAM" | "STREAM_CLOSED" | "JSON_SERIALIZATION_FAILED" | "WRITE_FAILED" };
export interface ReferenceServer {
  url: string; streamUrl: string; sendUrl: string;
  sendA2UI(message: unknown): Promise<SendResult>;
  closeStream(): void;
  close(): Promise<void>;
}

function mediaTypes(value: string | undefined): string[] {
  return (value ?? "").split(",").map(part => part.trim().split(";", 1)[0]!.trim().toLowerCase()).filter(Boolean);
}
function object(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: JsonObject, allowed: readonly string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
async function jsonBody(request: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const chunks: Buffer[] = []; let size = 0;
  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > BODY_LIMIT) { request.resume(); return { ok: false, status: 413 }; }
      chunks.push(bytes);
    }
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown };
  } catch { return { ok: false, status: 400 }; }
}
function fail(response: ServerResponse, status: number): void { response.writeHead(status).end(); }
function validMetadata(value: unknown, send: boolean): value is JsonObject {
  return object(value) && exact(value, send ? ["a2uiClientCapabilities", "a2uiClientDataModel"] : ["a2uiClientCapabilities"]) && object(value.a2uiClientCapabilities);
}

export async function startReferenceServer(options: ReferenceServerOptions = {}): Promise<ReferenceServer> {
  let active: ServerResponse | undefined;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path !== "/a2ui/stream" && path !== "/a2ui/send") { fail(response, 404); return; }
    if (request.method !== "POST") { response.setHeader("Allow", "POST"); fail(response, 405); return; }
    if (!mediaTypes(request.headers["content-type"]).includes("application/json")) { fail(response, 400); return; }
    if (path === "/a2ui/stream" && !mediaTypes(request.headers.accept).includes("text/event-stream")) { fail(response, 400); return; }
    if (path === "/a2ui/stream" && active !== undefined && !active.destroyed && !active.writableEnded) { fail(response, 409); return; }
    const body = await jsonBody(request);
    if (!body.ok) { fail(response, body.status); return; }
    if (!object(body.value)) { fail(response, 400); return; }
    if (path === "/a2ui/stream") {
      if (!exact(body.value, ["metadata"]) || !validMetadata(body.value.metadata, false)) { fail(response, 400); return; }
      try { await options.onStreamOpen?.(structuredClone(body.value.metadata.a2uiClientCapabilities as JsonObject)); }
      catch { fail(response, 500); return; }
      active = response;
      response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" });
      response.flushHeaders(); response.write(": connected\n\n");
      const release = () => { if (active === response) active = undefined; };
      response.once("close", release); response.once("finish", release);
      return;
    }
    if (!exact(body.value, ["message", "metadata"]) || !object(body.value.message) || !validMetadata(body.value.metadata, true)) { fail(response, 400); return; }
    const received: ReceivedClientMessage = { message: structuredClone(body.value.message), capabilities: structuredClone(body.value.metadata.a2uiClientCapabilities as JsonObject) };
    if ("a2uiClientDataModel" in body.value.metadata) received.clientDataModel = structuredClone(body.value.metadata.a2uiClientDataModel);
    try { await options.onClientMessage?.(received); }
    catch { fail(response, 500); return; }
    response.writeHead(204).end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (address === null || typeof address === "string") throw new Error("Reference server did not bind TCP");
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url, streamUrl: `${url}/a2ui/stream`, sendUrl: `${url}/a2ui/send`,
    async sendA2UI(message) {
      if (active === undefined) return { ok: false, error: "NO_ACTIVE_STREAM" };
      if (active.destroyed || active.writableEnded) return { ok: false, error: "STREAM_CLOSED" };
      let json: string | undefined; try { json = JSON.stringify(message); } catch { return { ok: false, error: "JSON_SERIALIZATION_FAILED" }; }
      if (json === undefined) return { ok: false, error: "JSON_SERIALIZATION_FAILED" };
      try { if (!active.write(`event: a2ui\ndata: ${json}\n\n`)) await once(active, "drain"); return { ok: true }; }
      catch { return { ok: false, error: "WRITE_FAILED" }; }
    },
    closeStream() { active?.end(); },
    async close() { active?.end(); if (server.listening) { server.close(); await once(server, "close"); } },
  };
}

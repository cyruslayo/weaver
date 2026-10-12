/**
 * Share links. The editor text travels in the URL fragment as base64url of its UTF-8
 * bytes: `#jsonl=<value>`. A fragment is never sent to a server.
 *
 * The fragment is untrusted input. Decoding only turns it back into text. That text
 * then goes through the same ingestion path as any typed text, and nothing here
 * parses A2UI or repairs it.
 */

export const SHARE_PARAM = "jsonl";

/** The largest text, in UTF-8 bytes, that a share link carries or decodes. */
export const MAX_SHARED_BYTES = 64 * 1024;

const BASE64URL = /^[A-Za-z0-9_-]*$/;
/** Base64 of MAX_SHARED_BYTES is 4/3 of its size, rounded up to a multiple of 4. */
const MAX_ENCODED_LENGTH = Math.ceil((MAX_SHARED_BYTES * 4) / 3) + 4;

export type ShareEncodeResult = { ok: true; fragment: string } | { ok: false; reason: "too-large" };

export type ShareDecodeFailure = "absent" | "too-large" | "malformed" | "not-utf8";

export type ShareDecodeResult = { ok: true; text: string } | { ok: false; reason: ShareDecodeFailure };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  // Chunked, so a 64 KB text never builds one huge argument list.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Returns the fragment `#jsonl=...` for the text, or refuses a text over the cap. */
export function encodeSharedJsonl(text: string): ShareEncodeResult {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_SHARED_BYTES) return { ok: false, reason: "too-large" };
  return { ok: true, fragment: `#${SHARE_PARAM}=${toBase64Url(bytes)}` };
}

/**
 * Reads the `jsonl` value from a location hash. A missing value is `absent`, which is
 * not an error: the page then loads its default example.
 */
export function decodeSharedJsonl(hash: string): ShareDecodeResult {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = `${SHARE_PARAM}=`;
  const part = body.split("&").find((candidate) => candidate.startsWith(prefix));
  if (part === undefined) return { ok: false, reason: "absent" };

  const encoded = part.slice(prefix.length);
  // Refuse before decoding, so an oversized fragment costs nothing.
  if (encoded.length > MAX_ENCODED_LENGTH) return { ok: false, reason: "too-large" };
  const hasValidAlphabet = BASE64URL.test(encoded);
  const hasValidLength = encoded.length % 4 !== 1;
  if (!hasValidAlphabet || !hasValidLength) return { ok: false, reason: "malformed" };

  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (binary.length > MAX_SHARED_BYTES) return { ok: false, reason: "too-large" };

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "not-utf8" };
  }
}

/** A short message for each decode failure. The page shows it as text, never as markup. */
export function describeShareDecodeFailure(reason: Exclude<ShareDecodeFailure, "absent">): string {
  switch (reason) {
    case "too-large":
      return `This share link is larger than ${MAX_SHARED_BYTES / 1024} KB, so it was not loaded.`;
    case "malformed":
      return "This share link is not valid base64url, so it was not loaded.";
    case "not-utf8":
      return "This share link does not decode to UTF-8 text, so it was not loaded.";
  }
}

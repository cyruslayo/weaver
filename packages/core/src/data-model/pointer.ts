import type { JsonValue } from "../protocol/index.js";
import type { DataModelResult } from "./errors.js";

const success = <T>(value: T): DataModelResult<T> => ({ ok: true, value });

/** Parses A2UI JSON Pointers. Unlike RFC 6901, A2UI uses `/` for the root. */
export function parsePointer(path: string): DataModelResult<string[]> {
  if (path === "/") return success([]);
  if (!path.startsWith("/") || path.startsWith("#/")) {
    return { ok: false, error: { code: "INVALID_POINTER", path } };
  }

  const tokens: string[] = [];
  for (const encoded of path.slice(1).split("/")) {
    const decoded = decodePointerToken(encoded);
    if (decoded === undefined) {
      return { ok: false, error: { code: "INVALID_POINTER_ESCAPE", path } };
    }
    tokens.push(decoded);
  }
  return success(tokens);
}

/** Internal shared token codec; package barrels intentionally do not export it. */
export function decodePointerToken(encoded: string): string | undefined {
  let token = "";
  for (let index = 0; index < encoded.length; index += 1) {
    const character = encoded[index];
    if (character !== "~") {
      token += character;
      continue;
    }
    const escape = encoded[index + 1];
    if (escape === "0") token += "~";
    else if (escape === "1") token += "/";
    else return undefined;
    index += 1;
  }
  return token;
}

export function formatPointer(tokens: readonly string[]): string {
  if (tokens.length === 0) return "/";
  return `/${tokens.map((token) => token.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

export function readTokens(root: JsonValue, tokens: readonly string[]): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const token of tokens) {
    if (current === null || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      if (!isArrayIndex(token)) return undefined;
      const index = Number(token);
      if (index >= current.length) return undefined;
      current = current[index];
    } else {
      current = Object.prototype.hasOwnProperty.call(current, token) ? current[token] : undefined;
    }
  }
  return current;
}

export function isArrayIndex(token: string): boolean {
  return /^(0|[1-9]\d*)$/.test(token);
}

export function pointersRelated(left: readonly string[], right: readonly string[]): boolean {
  const common = Math.min(left.length, right.length);
  for (let index = 0; index < common; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

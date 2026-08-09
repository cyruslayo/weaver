import { decodePointerToken, formatPointer, parsePointer } from "../data-model/pointer.js";
import type { DataContextResult } from "./errors.js";

const success = <T>(value: T): DataContextResult<T> => ({ ok: true, value });

export function resolveScopedPath(
  path: string,
  scopeTokens: readonly string[],
): DataContextResult<{ absolutePath: string; tokens: string[] }> {
  if (path.startsWith("/")) {
    const parsed = parsePointer(path);
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: parsed.error.code === "INVALID_POINTER_ESCAPE" ? "INVALID_POINTER_ESCAPE" : "INVALID_PATH",
          path,
        },
      };
    }
    return success({ absolutePath: formatPointer(parsed.value), tokens: parsed.value });
  }

  if (path.length === 0 || path.startsWith("#")) {
    return { ok: false, error: { code: "INVALID_PATH", path } };
  }
  if (scopeTokens.length === 0) {
    return { ok: false, error: { code: "RELATIVE_PATH_OUTSIDE_COLLECTION", path } };
  }

  const relativeTokens: string[] = [];
  for (const encoded of path.split("/")) {
    const token = decodePointerToken(encoded);
    if (token === undefined) {
      return { ok: false, error: { code: "INVALID_POINTER_ESCAPE", path } };
    }
    relativeTokens.push(token);
  }
  const tokens = [...scopeTokens, ...relativeTokens];
  return success({ absolutePath: formatPointer(tokens), tokens });
}

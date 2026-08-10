import type { FunctionImplementation } from "@weaver/core";
import type { BasicCatalogBrowserFunctionOptions } from "./types.js";

function requireHttpUrl(value: string, baseUrl?: string): URL {
  let parsed: URL;
  try {
    parsed = baseUrl === undefined ? new URL(value) : new URL(value, baseUrl);
  } catch {
    throw new TypeError("openUrl requires a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("openUrl permits only HTTP and HTTPS URLs");
  }
  return parsed;
}

export function createOpenUrlImplementation(
  options: BasicCatalogBrowserFunctionOptions,
  configuredBaseUrl?: string,
): FunctionImplementation {
  return (args) => {
    if (typeof args.url !== "string") throw new TypeError("openUrl requires a string url argument");
    const browserWindow = globalThis.window;
    const runtimeBase = configuredBaseUrl ?? browserWindow?.location?.href;
    let finalUrl = requireHttpUrl(args.url, runtimeBase).href;
    if (options.openUrlPolicy !== undefined) {
      const candidate = options.openUrlPolicy({ url: finalUrl });
      if (candidate === undefined) throw new Error("openUrl was denied by host policy");
      finalUrl = requireHttpUrl(candidate).href;
    }
    if (browserWindow === undefined || typeof browserWindow.open !== "function") {
      throw new Error("Browser window.open is unavailable");
    }
    browserWindow.open(finalUrl, "_blank", "noopener,noreferrer");
    return undefined;
  };
}

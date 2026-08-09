export const WEAVER_CORE_VERSION = "0.0.0-dev";

export function createWeaverRuntime() {
  return {
    status: "ready" as const,
  };
}

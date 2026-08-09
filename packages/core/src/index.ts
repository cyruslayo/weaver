export * from "./catalog/index.js";
export * from "./checks/index.js";
export * from "./component-tree/index.js";
export * from "./component-instances/index.js";
export * from "./component-properties/index.js";
export * from "./functions/index.js";
export * from "./data-context/index.js";
export * from "./data-model/index.js";
export * from "./message-processor/index.js";
export * from "./protocol/index.js";
export * from "./surfaces/index.js";
export * from "./transport/index.js";

export const WEAVER_CORE_VERSION = "0.0.0-dev";

export function createWeaverRuntime() {
  return {
    status: "ready" as const,
  };
}

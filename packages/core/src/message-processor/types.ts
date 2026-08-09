import type { SurfaceSnapshot } from "../surfaces/index.js";
import type { MessageProcessorError } from "./errors.js";

export type MessageProcessorSuccess =
  | {
      operation: "surfaceCreated" | "componentsUpdated" | "dataModelUpdated";
      surfaceId: string;
      surface: SurfaceSnapshot;
    }
  | {
      operation: "surfaceDeleted";
      surfaceId: string;
    };

export type MessageProcessorResult =
  | { ok: true; value: MessageProcessorSuccess }
  | { ok: false; error: MessageProcessorError };

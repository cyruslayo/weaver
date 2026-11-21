import type { SurfaceSnapshot } from "../surfaces/index.js";
import type { A2UIRendererFunctionResponseMessage } from "../protocol/index.js";
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
    }
  | {
      /**
       * A callRendererFunction was executed or refused. The host must send
       * `response` to the agent. Semantic failures are ok results whose response
       * carries the error. Such a result has no surfaceId.
       */
      operation: "rendererFunctionResponded";
      response: A2UIRendererFunctionResponseMessage;
    };

export type MessageProcessorResult =
  | { ok: true; value: MessageProcessorSuccess }
  | { ok: false; error: MessageProcessorError };

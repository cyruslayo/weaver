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
    }
  | {
      /**
       * An agentFunctionResponse settled a pending call. The surface was notified,
       * so subscribers re-resolve it. `continuation` is set when the call belongs to
       * an action, and the runtime runs it. It is never returned by the runtime.
       */
      operation: "agentFunctionResolved";
      surfaceId: string;
      functionCallId: string;
      continuation?: () => unknown;
    }
  | {
      /** An agentFunctionResponse matched no pending call (unknown or already settled). Nothing changed and nothing is sent. */
      operation: "agentFunctionIgnored";
      functionCallId: string;
    };

export type MessageProcessorResult =
  | { ok: true; value: MessageProcessorSuccess }
  | { ok: false; error: MessageProcessorError };

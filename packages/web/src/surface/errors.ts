import type { WeaverSurfaceResolutionError } from "@weaver/core";

export type WebRenderError =
  | { code: "SURFACE_RESOLUTION_FAILED"; cause: WeaverSurfaceResolutionError }
  | { code: "THEME_ADAPTER_FAILED" }
  | { code: "ATTRIBUTION_PROVIDER_FAILED" }
  | { code: "INVALID_VERIFIED_ATTRIBUTION" }
  | {
      code: "RENDERER_NOT_FOUND";
      catalogId: string;
      component: string;
      sourceComponentId: string;
      scopePath: string;
    }
  | {
      code: "RENDERER_EXECUTION_FAILED";
      catalogId: string;
      component: string;
      sourceComponentId: string;
      scopePath: string;
    }
  | {
      code: "INVALID_RENDERER_RESULT";
      catalogId: string;
      component: string;
      sourceComponentId: string;
      scopePath: string;
    };

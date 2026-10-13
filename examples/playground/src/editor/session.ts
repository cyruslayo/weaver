import {
  createA2UIV091StreamIngestion,
  describeWeaverError,
  type A2UIV091StreamIngestion,
  type A2UIV091StreamIngestionEvent,
  type JsonValue,
  type WeaverErrorDescription,
  type WeaverRuntimeEvent,
} from "@cylayo/weaver-core";
import {
  createBasicWebRuntime,
  describeWebRenderError,
  type BasicWebRuntime,
  type WebServerEventHandoff,
  type WebSurfaceMount,
} from "@cylayo/weaver-web";
import { resolveSampleImageUrl } from "./media-policy.js";

/** Receives what the live preview does. Every callback is an observation only. */
export interface SessionHooks {
  readonly onRuntimeEvent: (event: WeaverRuntimeEvent) => void;
  /** A server event is displayed by the Playground. It is never sent anywhere. */
  readonly onServerEvent: (event: WebServerEventHandoff) => void;
}

/** The page's location, passed in so this module never reads `import.meta` itself. */
export interface SessionPage {
  readonly pageUrl: string;
  readonly baseUrl: string;
}

/**
 * One fresh Basic Web runtime, one JSONL ingestion into it, and one preview mount.
 * A rebuild or a stream step creates a session, so no state carries over between
 * edits. Rejected frames are kept here, unchanged, as described errors.
 */
export class PlaygroundSession {
  readonly #web: BasicWebRuntime;
  readonly #ingestion: A2UIV091StreamIngestion;
  readonly #rejected: WeaverErrorDescription[] = [];
  readonly #renderErrors: WeaverErrorDescription[] = [];
  #surfaceId: string | undefined;
  #mount: WebSurfaceMount | undefined;
  #acceptedFrames = 0;

  constructor(page: SessionPage, hooks: SessionHooks) {
    const created = createBasicWebRuntime({
      runtime: { observer: hooks.onRuntimeEvent },
      basic: {
        // Media is deny-by-default. Only same-origin samples/ files load.
        resourcePolicy: ({ url }) => resolveSampleImageUrl(url, page.pageUrl, page.baseUrl),
      },
      rendering: {
        attributionProvider: () => ({ displayName: "Playground Agent" }),
        onServerEvent: hooks.onServerEvent,
      },
    });
    if (!created.ok) throw new Error(`Playground runtime configuration failed: ${created.error.code}`);
    this.#web = created.value;
    this.#ingestion = createA2UIV091StreamIngestion({ runtime: this.#web.runtime });
  }

  get surfaceId(): string | undefined {
    return this.#surfaceId;
  }

  get acceptedFrames(): number {
    return this.#acceptedFrames;
  }

  /** Every error so far: rejected frames first, then render errors. */
  get errors(): readonly WeaverErrorDescription[] {
    return [...this.#rejected, ...this.#renderErrors];
  }

  /** Feeds raw JSONL text into the ingestion. Frame numbers continue across calls. */
  pushText(text: string): void {
    this.#apply(this.#ingestion.push(text));
  }

  /** Processes a valid unterminated final frame, if there is one. */
  finish(): void {
    this.#apply(this.#ingestion.finish());
  }

  #apply(events: readonly A2UIV091StreamIngestionEvent[]): void {
    for (const event of events) {
      if (event.ok) {
        this.#acceptedFrames += 1;
        const isFirstSurface = this.#surfaceId === undefined;
        if (isFirstSurface && event.value.operation === "surfaceCreated") {
          this.#surfaceId = event.value.surfaceId;
        }
      } else {
        this.#rejected.push(describeWeaverError(event.error, { frame: event.frame }));
      }
    }
  }

  /** Mounts the surface into `target`, replacing whatever the previous mount drew. */
  mountPreview(target: HTMLElement): boolean {
    this.#unmount();
    target.replaceChildren();
    if (this.#surfaceId === undefined) return false;
    const mounted = this.#web.mount({
      surfaceId: this.#surfaceId,
      target,
      onError: (error) => this.#addRenderError(describeWebRenderError(error)),
    });
    if (!mounted.ok) {
      this.#addRenderError(describeWebRenderError(mounted.error));
      return false;
    }
    this.#mount = mounted.value;
    return true;
  }

  /** Re-renders the mounted surface after new frames. A failed render is recorded as an error. */
  refreshPreview(): void {
    if (this.#mount === undefined) return;
    const result = this.#mount.refresh();
    if (!result.ok) this.#addRenderError(describeWebRenderError(result.error));
  }

  /** The current surface's data model as a JSON value, or null before a surface exists. */
  dataModel(): JsonValue | null {
    if (this.#surfaceId === undefined) return null;
    const snapshot = this.#web.runtime.getSurface(this.#surfaceId);
    return snapshot === undefined ? null : snapshot.dataModel;
  }

  dispose(): void {
    this.#unmount();
  }

  #unmount(): void {
    this.#mount?.unmount();
    this.#mount = undefined;
  }

  #addRenderError(description: WeaverErrorDescription): void {
    // The same render failure can be reported by both the update callback and a refresh.
    const key = JSON.stringify(description);
    const alreadyRecorded = this.#renderErrors.some((existing) => JSON.stringify(existing) === key);
    if (!alreadyRecorded) this.#renderErrors.push(description);
  }
}

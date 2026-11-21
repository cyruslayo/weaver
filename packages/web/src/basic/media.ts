import type { WebComponentRenderer } from "../renderers/index.js";
import { applyBasicHook } from "./layout.js";
import { applyBasicMargin } from "./styles.js";

export type BasicResourceKind = "image" | "video" | "audio";

export interface BasicResourceRequest {
  kind: BasicResourceKind;
  url: string;
}

export type BasicResourcePolicy = (
  request: Readonly<BasicResourceRequest>,
) => string | undefined;

/** Outcome of the spec URL rule, before any host policy runs. */
export type BasicMediaUrlCheck =
  | { status: "unavailable" }
  | { status: "rejected" }
  | { status: "eligible"; url: string };

/** Only the scheme and leading characters are inspected, so megabyte data URLs stay cheap. */
const PROBE_LENGTH = 2048;
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const HTTP_WITH_HOST = /^https?:\/\/[^/\\?#\s]/i;
/** The leading run of scheme, slash and whitespace-control characters, where browser parsers strip characters. */
const SYNTAX_RUN = /^[A-Za-z0-9+.\-:/\\\t\n\r]*/;

const isControlOrSpace = (character: string): boolean => /[\s\p{Cc}]/u.test(character);

function trimControlsAndSpace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isControlOrSpace(value[start]!)) start++;
  while (end > start && isControlOrSpace(value[end - 1]!)) end--;
  return value.slice(start, end);
}

/**
 * Applies the A2UI media URL rule shared by Image, Video, Video.posterUrl and AudioPlayer:
 * trim, allow only http(s) with an authority, data, or same-host relative paths, and reject
 * protocol-relative forms. Eligibility never replaces the host resource policy.
 */
export function checkBasicMediaUrl(value: unknown): BasicMediaUrlCheck {
  if (typeof value !== "string") return { status: "unavailable" };
  const trimmed = trimControlsAndSpace(value);
  if (trimmed === "") return { status: "unavailable" };
  const head = trimmed.slice(0, PROBE_LENGTH);
  // Tab, newline and carriage return inside the scheme or leading slashes are dropped by browser parsers,
  // so such a string could be read differently than it was validated: reject it outright.
  if (/[\t\n\r]/.test(SYNTAX_RUN.exec(head)?.[0] ?? "")) return { status: "rejected" };
  const probe = head.replace(/[\t\n\r]/g, "");
  const scheme = SCHEME.exec(probe)?.[1]?.toLowerCase();
  if (scheme !== undefined) {
    const eligible = scheme === "data"
      || ((scheme === "http" || scheme === "https") && HTTP_WITH_HOST.test(probe));
    return eligible ? { status: "eligible", url: trimmed } : { status: "rejected" };
  }
  // A relative path that begins with two slashes (or a slash and backslash) names another host.
  const leading = probe.slice(0, 2).replace(/\\/g, "/");
  return leading === "//" ? { status: "rejected" } : { status: "eligible", url: trimmed };
}

const imageFits = {
  contain: "contain",
  cover: "cover",
  fill: "fill",
  none: "none",
  scaleDown: "scale-down",
} as const;

const imageVariants = new Set([
  "icon",
  "avatar",
  "smallFeature",
  "mediumFeature",
  "largeFeature",
  "header",
]);

/** Resolves one agent URL through the spec rule and then the host policy; the policy decides the final string. */
function resolveApprovedUrl(
  kind: BasicResourceKind,
  value: unknown,
  resourcePolicy: BasicResourcePolicy | undefined,
): { state: "unavailable" | "rejected" | "blocked" } | { state: "approved"; url: string } {
  const check = checkBasicMediaUrl(value);
  if (check.status !== "eligible") return { state: check.status };
  const approved = resourcePolicy?.(Object.freeze({ kind, url: check.url }));
  if (typeof approved !== "string" || approved.trim() === "") return { state: "blocked" };
  return { state: "approved", url: approved };
}

function applyResource(
  element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement,
  kind: BasicResourceKind,
  value: unknown,
  resourcePolicy: BasicResourcePolicy | undefined,
): void {
  const resolved = resolveApprovedUrl(kind, value, resourcePolicy);
  element.setAttribute("data-a2ui-resource-state", resolved.state);
  if (resolved.state === "approved") element.setAttribute("src", resolved.url);
}

export function createBasicMediaRenderers(
  resourcePolicy?: BasicResourcePolicy,
): Record<"Image" | "Video" | "AudioPlayer", WebComponentRenderer> {
  const Image: WebComponentRenderer = ({ document, properties }) => {
    const image = document.createElement("img");
    applyBasicHook(image, "Image");
    image.alt = typeof properties.description === "string" ? properties.description : "";
    const fit = typeof properties.fit === "string" && properties.fit in imageFits
      ? properties.fit as keyof typeof imageFits
      : "fill";
    image.style.objectFit = imageFits[fit];
    image.style.display = "block";
    const variant = typeof properties.variant === "string" && imageVariants.has(properties.variant)
      ? properties.variant
      : "mediumFeature";
    image.setAttribute("data-a2ui-variant", variant);
    image.style.maxWidth = "100%";
    if (variant === "icon") { image.style.width = "24px"; image.style.height = "24px"; }
    else if (variant === "avatar") { image.style.width = "40px"; image.style.height = "40px"; image.style.borderRadius = "50%"; }
    else if (variant === "smallFeature") { image.style.width = "100px"; image.style.height = "100px"; }
    else if (variant === "mediumFeature") { image.style.width = "100%"; image.style.maxWidth = "300px"; }
    else if (variant === "largeFeature") { image.style.width = "100%"; image.style.maxHeight = "400px"; }
    else { image.style.width = "100%"; image.style.height = "200px"; }
    applyBasicMargin(image);
    applyResource(image, "image", properties.url, resourcePolicy);
    return image;
  };

  const Video: WebComponentRenderer = ({ document, properties }) => {
    const video = document.createElement("video");
    applyBasicHook(video, "Video");
    video.controls = true;
    video.style.width = "100%";
    video.style.maxWidth = "100%";
    applyBasicMargin(video);
    applyResource(video, "video", properties.url, resourcePolicy);
    // The poster is an image, so it takes the image policy and deny-by-default behavior.
    const poster = resolveApprovedUrl("image", properties.posterUrl, resourcePolicy);
    video.setAttribute("data-a2ui-poster-state", poster.state);
    if (poster.state === "approved") video.setAttribute("poster", poster.url);
    return video;
  };

  const AudioPlayer: WebComponentRenderer = ({ document, properties }) => {
    const figure = document.createElement("figure");
    applyBasicHook(figure, "AudioPlayer");
    applyBasicMargin(figure);
    const audio = document.createElement("audio");
    audio.controls = true;
    applyResource(audio, "audio", properties.url, resourcePolicy);
    figure.append(audio);
    if (typeof properties.description === "string") {
      const caption = document.createElement("figcaption");
      caption.textContent = properties.description;
      figure.append(caption);
    }
    return figure;
  };

  return { Image, Video, AudioPlayer };
}

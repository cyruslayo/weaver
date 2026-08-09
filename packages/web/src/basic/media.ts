import type { WebComponentRenderer } from "../renderers/index.js";
import { applyBasicHook } from "./layout.js";

export type BasicResourceKind = "image" | "video" | "audio";

export interface BasicResourceRequest {
  kind: BasicResourceKind;
  url: string;
}

export type BasicResourcePolicy = (
  request: Readonly<BasicResourceRequest>,
) => string | undefined;

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

function applyResource(
  element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement,
  kind: BasicResourceKind,
  value: unknown,
  resourcePolicy: BasicResourcePolicy | undefined,
): void {
  if (typeof value !== "string" || value.trim() === "") {
    element.setAttribute("data-a2ui-resource-state", "unavailable");
    return;
  }
  const approved = resourcePolicy?.(Object.freeze({ kind, url: value }));
  if (typeof approved !== "string" || approved.trim() === "") {
    element.setAttribute("data-a2ui-resource-state", "blocked");
    return;
  }
  element.setAttribute("src", approved);
  element.setAttribute("data-a2ui-resource-state", "approved");
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
    const variant = typeof properties.variant === "string" && imageVariants.has(properties.variant)
      ? properties.variant
      : "mediumFeature";
    image.setAttribute("data-a2ui-variant", variant);
    image.style.maxWidth = "100%";
    if (variant === "icon" || variant === "avatar") image.style.aspectRatio = "1 / 1";
    if (variant === "avatar") image.style.borderRadius = "50%";
    if (variant === "header") image.style.width = "100%";
    applyResource(image, "image", properties.url, resourcePolicy);
    return image;
  };

  const Video: WebComponentRenderer = ({ document, properties }) => {
    const video = document.createElement("video");
    applyBasicHook(video, "Video");
    video.controls = true;
    video.style.maxWidth = "100%";
    applyResource(video, "video", properties.url, resourcePolicy);
    return video;
  };

  const AudioPlayer: WebComponentRenderer = ({ document, properties }) => {
    const figure = document.createElement("figure");
    applyBasicHook(figure, "AudioPlayer");
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

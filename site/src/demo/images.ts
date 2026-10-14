/**
 * Where the demo's photos live. A2UI carries the relative path, and the media policy resolves it
 * against the site base, so the same data works at the root and under /weaver/.
 */
import { IMAGE_FILES, type ImageKey } from "./data.js";

/** The folder under the site base that holds the demo photos (public/images). */
export const IMAGE_FOLDER = "images/";

/** The relative source of a demo photo, for example "images/hotel-tejo.jpg". */
export function imageSource(key: ImageKey): string {
  return IMAGE_FOLDER + IMAGE_FILES[key] + ".jpg";
}

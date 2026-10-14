/**
 * The demo's media policy. Only same-origin files under `images/` load. Every other URL is
 * denied, so an image the agent names elsewhere never reaches the page.
 *
 * The page URL and the Vite base are passed in, so this module has no import.meta and can be
 * tested in node.
 */

/**
 * Resolves a requested image URL against the page. Returns the absolute URL when it is under
 * `<base>images/` on the page's origin, and `undefined` otherwise.
 */
export function resolveSiteImageUrl(requested: string, pageUrl: string, baseUrl: string): string | undefined {
  let root: URL;
  let imagesRoot: URL;
  let candidate: URL;
  try {
    root = new URL(baseUrl, pageUrl);
    imagesRoot = new URL("images/", root);
    candidate = new URL(requested, root);
  } catch {
    return undefined;
  }
  const isSameOrigin = candidate.origin === imagesRoot.origin;
  const isUnderImages = candidate.pathname.startsWith(imagesRoot.pathname);
  const isImagesFolderItself = candidate.pathname === imagesRoot.pathname;
  if (!isSameOrigin || !isUnderImages || isImagesFolderItself) return undefined;
  return candidate.href;
}

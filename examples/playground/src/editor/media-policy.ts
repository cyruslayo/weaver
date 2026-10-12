/**
 * The Playground's media policy. Only same-origin files under `samples/` load. Every
 * other URL is denied, including a URL typed into the editor that points elsewhere.
 *
 * The page URL and the Vite base are passed in, so this module has no import.meta and
 * can be tested in node.
 */

/**
 * Resolves a requested image URL against the page. Returns the absolute URL when it is
 * under `<base>samples/` on the page's origin, and `undefined` otherwise.
 */
export function resolveSampleImageUrl(requested: string, pageUrl: string, baseUrl: string): string | undefined {
  let root: URL;
  let samplesRoot: URL;
  let candidate: URL;
  try {
    root = new URL(baseUrl, pageUrl);
    samplesRoot = new URL("samples/", root);
    candidate = new URL(requested, root);
  } catch {
    return undefined;
  }
  const isSameOrigin = candidate.origin === samplesRoot.origin;
  const isUnderSamples = candidate.pathname.startsWith(samplesRoot.pathname);
  const isSamplesFolderItself = candidate.pathname === samplesRoot.pathname;
  if (!isSameOrigin || !isUnderSamples || isSamplesFolderItself) return undefined;
  return candidate.href;
}

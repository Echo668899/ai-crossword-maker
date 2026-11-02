/**
 * Cloudflare Pages Advanced Mode. Astro copies this file to dist/_worker.js.
 *
 * SSG only emits shell pages (`/p/_/`, `/app/packs/_/`, `/app/puzzles/_/edit/`).
 * Share tokens live in the URL; PlayApp reads `window.location.pathname`.
 *
 * `_redirects` 200-proxy to `/p/_/index.html` is not enough on Workers-backed
 * Pages: HTML handling does not serve `index.html` as a pretty URL, and the
 * real `404.html` wins — which is why live `/p/:token/` returned the Astro 404.
 */

/**
 * @param {string} pathname
 * @returns {string | null} pretty asset path to fetch, or null to pass through
 */
export function rewriteAssetPath(pathname) {
  const play = pathname.match(/^\/p\/([^/]+)\/?$/);
  if (play && play[1] !== "_") return "/p/_/";

  const pack = pathname.match(/^\/app\/packs\/([^/]+)\/?$/);
  if (pack && pack[1] !== "_") return "/app/packs/_/";

  const edit = pathname.match(/^\/app\/puzzles\/([^/]+)\/edit\/?$/);
  if (edit && edit[1] !== "_") return "/app/puzzles/_/edit/";

  return null;
}

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: { fetch: (input: Request) => Promise<Response> } }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const dest = rewriteAssetPath(url.pathname);
    if (dest) {
      const rewritten = new URL(url);
      rewritten.pathname = dest;
      return env.ASSETS.fetch(new Request(rewritten, request));
    }
    return env.ASSETS.fetch(request);
  },
};

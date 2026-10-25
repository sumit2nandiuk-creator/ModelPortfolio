// Cloudflare Pages Function for /:slug (redirects R2-backed profiles to /:slug/,
// falling through to static asset routing for everything else).

import { handleModelPageRequest } from '../worker/src/index.mjs';

export function onRequest(context) {
  return handleModelPageRequest(context, { trailingSlash: false });
}

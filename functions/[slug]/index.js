// Cloudflare Pages Function for /:slug/ (renders R2-updated or newly created profiles immediately,
// falling through to static dist/:slug/index.html when no R2 override exists).

import { handleModelPageRequest } from '../../worker/src/index.mjs';

export function onRequest(context) {
  return handleModelPageRequest(context, { trailingSlash: true });
}

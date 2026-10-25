// Cloudflare Pages Function for /media/* (streams uploaded photos and videos from private R2).
// Public Development URL (r2.dev) does NOT need to be enabled on the R2 bucket.

import { handleRequest } from '../../worker/src/index.mjs';

export function onRequest(context) {
  return handleRequest(context.request, context.env);
}

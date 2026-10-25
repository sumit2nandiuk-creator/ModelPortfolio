// Cloudflare Pages Function for /api/* (admin endpoints).
// Uses the shared Worker handler so no separate Worker deployment is needed on Cloudflare Pages.

import { handleRequest } from '../../worker/src/index.mjs';

export function onRequest(context) {
  return handleRequest(context.request, context.env);
}

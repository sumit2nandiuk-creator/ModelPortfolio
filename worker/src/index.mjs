// Admin API for the portfolio sites. Runs as a Cloudflare Worker.
//
//   GET    /api/models                       list profiles
//   GET    /api/models/:slug                 read one profile (and its version)
//   PUT    /api/models/:slug                 save a profile (commits models/<slug>/model.json)
//   POST   /api/models/:slug/media           upload a photo or video to R2 (multipart: "file")
//   DELETE /api/models/:slug/media           delete an uploaded file from R2 (JSON: { "url" })
//
// Every request needs "Authorization: Bearer <ADMIN_TOKEN>". The GitHub token and the
// R2 bucket binding stay here on the server; the browser never sees them.

import {
  SLUG_PATTERN,
  bearerToken,
  checkUpload,
  constantTimeEqual,
  keyFromPublicUrl,
  mediaKeyFor,
  validateModelShape,
} from './model.mjs';
import { getModelFile, HttpError, listModelSlugs, putModelFile } from './github.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const MEDIA_CACHE = 'public, max-age=31536000, immutable';

function allowedOrigins(env) {
  return String(env.ADMIN_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(origin, allowed) {
  const headers = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    });
  }
  return headers;
}

function reply(cors, body, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...cors },
  });
}

function fail(cors, status, message, extra = {}) {
  return reply(cors, { error: message, ...extra }, status);
}

// Entry point used by the Workers runtime.
export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

// `deps` lets the tests replace fetch, the clock and the random id.
export async function handleRequest(request, env, deps = {}) {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigins(env);
  const cors = corsHeaders(origin, allowed);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return fail(cors, 404, 'Not found.');
    if (origin && !allowed.includes(origin)) return fail(cors, 403, 'This website is not allowed to use the admin.');
    if (!env.ADMIN_TOKEN || !env.GITHUB_TOKEN || !env.REPO || !env.MEDIA) {
      return fail(cors, 500, 'The admin is not configured yet. See the admin setup notes in README.md.');
    }
    if (!constantTimeEqual(bearerToken(request), env.ADMIN_TOKEN)) {
      return fail(cors, 401, 'Wrong admin token.');
    }

    const ctx = {
      cors,
      env,
      fetchImpl: deps.fetch ?? fetch,
      now: deps.now ?? (() => Date.now()),
      randomId: deps.randomId ?? (() => crypto.randomUUID().slice(0, 8)),
      repo: env.REPO,
      branch: env.BRANCH || 'main',
      token: env.GITHUB_TOKEN,
    };
    return await route(request, url, ctx);
  } catch (err) {
    if (err instanceof HttpError) return fail(cors, err.status, err.message);
    console.error(err);
    return fail(cors, 500, 'Something went wrong. Please try again.');
  }
}

async function route(request, url, ctx) {
  const { cors, env, repo, branch, token, fetchImpl } = ctx;
  const parts = url.pathname.split('/').filter(Boolean); // ["api", "models", slug?, "media"?]
  if (parts[1] !== 'models') return fail(cors, 404, 'Not found.');

  if (parts.length === 2) {
    if (request.method !== 'GET') return fail(cors, 405, 'Method not allowed.');
    const models = await listModelSlugs({ repo, branch, token, fetchImpl });
    return reply(cors, { models });
  }

  const slug = decodeURIComponent(parts[2] ?? '');
  if (!SLUG_PATTERN.test(slug)) return fail(cors, 400, 'That profile address is not valid.');

  if (parts.length === 3) {
    if (request.method === 'GET') {
      const file = await getModelFile({ repo, branch, token, fetchImpl, slug });
      if (!file) return fail(cors, 404, 'That profile does not exist.');
      return reply(cors, file);
    }
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') return fail(cors, 400, 'Send the profile as JSON.');
      const errors = validateModelShape(body.model, slug);
      if (errors.length) return fail(cors, 400, errors[0], { errors });
      const isNew = !body.sha;
      const sha = await putModelFile({
        repo,
        branch,
        token,
        fetchImpl,
        slug,
        model: body.model,
        sha: body.sha,
        message: isNew ? `Add ${slug} profile` : `Update ${slug} profile`,
      });
      return reply(cors, { sha });
    }
    return fail(cors, 405, 'Method not allowed.');
  }

  if (parts.length === 4 && parts[3] === 'media') {
    if (request.method === 'POST') {
      const form = await request.formData().catch(() => null);
      const file = form?.get('file');
      if (!file || typeof file !== 'object' || typeof file.size !== 'number') {
        return fail(cors, 400, 'Choose a file to upload.');
      }
      const check = checkUpload({ name: file.name, size: file.size });
      if (!check.ok) return fail(cors, 400, check.error);

      const key = mediaKeyFor(slug, file.name, ctx.now(), ctx.randomId());
      await env.MEDIA.put(key, file, {
        httpMetadata: { contentType: check.contentType, cacheControl: MEDIA_CACHE },
      });
      const base = String(env.R2_PUBLIC_BASE ?? '').replace(/\/+$/, '');
      const publicUrl = `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
      return reply(cors, { key, url: publicUrl, kind: check.kind }, 201);
    }
    if (request.method === 'DELETE') {
      const body = await request.json().catch(() => null);
      const key = keyFromPublicUrl(body?.url, env.R2_PUBLIC_BASE, slug);
      if (!key) return fail(cors, 400, 'That file does not belong to this profile.');
      await env.MEDIA.delete(key);
      return reply(cors, undefined, 204);
    }
    return fail(cors, 405, 'Method not allowed.');
  }

  return fail(cors, 404, 'Not found.');
}

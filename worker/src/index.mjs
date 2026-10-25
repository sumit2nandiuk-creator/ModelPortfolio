// Admin API + private R2 media server for the portfolio sites.
// Runs either as Cloudflare Pages Functions (/functions/api/* and /functions/media/*)
// or as a standalone Cloudflare Worker (worker/).
//
//   GET/HEAD /media/:slug/:file              stream an uploaded photo or video from private R2 (public, cached, HTTP Range)
//   GET      /api/models                     list profiles (requires Bearer ADMIN_TOKEN)
//   GET      /api/models/:slug               read one profile and its version (requires Bearer ADMIN_TOKEN)
//   PUT      /api/models/:slug               save a profile to GitHub (requires Bearer ADMIN_TOKEN)
//   POST     /api/models/:slug/media         upload a photo or video to R2 (requires Bearer ADMIN_TOKEN)
//   DELETE   /api/models/:slug/media         delete an uploaded file from R2 (requires Bearer ADMIN_TOKEN)
//
// Secrets (ADMIN_TOKEN, GITHUB_TOKEN) and the private R2 bucket binding (MEDIA) never leave the server.

import {
  SLUG_PATTERN,
  bearerToken,
  checkUpload,
  constantTimeEqual,
  keyFromPublicUrl,
  mediaKeyFor,
  parseByteRange,
  parseMediaPath,
  validateModelShape,
} from './model.mjs';
import { getModelFile, HttpError, listModelSlugs, putModelFile } from './github.mjs';

const DEFAULT_REPO = 'sumit2nandiuk-creator/ModelPortfolio';
const PLACEHOLDER_R2_BASE = 'https://media.example.com';
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const MEDIA_CACHE = 'public, max-age=31536000, immutable';

function allowedOrigins(env) {
  return String(env.ADMIN_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin, url, allowed) {
  if (!origin) return true;
  if (origin === url.origin) return true;
  return allowed.includes(origin);
}

function corsHeaders(origin, url, allowed) {
  const headers = { Vary: 'Origin' };
  if (origin && isOriginAllowed(origin, url, allowed)) {
    Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    });
  }
  return headers;
}

// On Cloudflare Pages deployment preview URLs (<hash>.<project>.pages.dev), canonicalise
// uploaded media URLs to the permanent <project>.pages.dev production domain.
function canonicalOrigin(url) {
  const parts = url.hostname.split('.');
  if (parts.length === 4 && parts[2] === 'pages' && parts[3] === 'dev') {
    return `${url.protocol}//${parts[1]}.pages.dev`;
  }
  return url.origin;
}

function publicMediaBase(url, env) {
  const configured = String(env.R2_PUBLIC_BASE ?? '').trim().replace(/\/+$/, '');
  if (configured && configured !== PLACEHOLDER_R2_BASE) return configured;
  return `${canonicalOrigin(url)}/media`;
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

function etagMatches(headerValue, etag) {
  if (!headerValue || !etag) return false;
  if (headerValue.trim() === '*') return true;
  return headerValue
    .split(',')
    .map((s) => s.trim().replace(/^W\//, ''))
    .includes(etag.replace(/^W\//, ''));
}

async function headObject(bucket, key) {
  if (typeof bucket.head === 'function') return bucket.head(key);
  return bucket.get(key);
}

// Public read-only media endpoint backed by the private R2 bucket (supports HTTP Range for video streaming).
async function serveMedia(request, url, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Range',
      },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS' } });
  }
  if (!env.MEDIA) {
    return new Response('Media storage is not configured.', { status: 500 });
  }

  const target = parseMediaPath(url.pathname);
  if (!target) {
    return new Response('Not found.', { status: 404 });
  }

  const baseHeaders = (meta) => {
    const headers = {
      'Content-Type': meta?.httpMetadata?.contentType || target.contentType,
      'Cache-Control': meta?.httpMetadata?.cacheControl || MEDIA_CACHE,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    };
    if (meta?.httpEtag) headers.ETag = meta.httpEtag;
    return headers;
  };

  if (request.method === 'HEAD') {
    const meta = await headObject(env.MEDIA, target.key);
    if (!meta) return new Response(null, { status: 404 });
    const headers = baseHeaders(meta);
    if (etagMatches(request.headers.get('If-None-Match'), meta.httpEtag)) {
      return new Response(null, { status: 304, headers });
    }
    headers['Content-Length'] = String(meta.size);
    return new Response(null, { status: 200, headers });
  }

  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    const meta = await headObject(env.MEDIA, target.key);
    if (!meta) return new Response('Not found.', { status: 404 });
    const ifRange = request.headers.get('If-Range');
    const ifRangeMatches = !ifRange || !meta.httpEtag || ifRange.trim() === meta.httpEtag;
    if (ifRangeMatches) {
      const parsed = parseByteRange(rangeHeader, meta.size);
      if (parsed.type === 'unsatisfiable') {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${meta.size}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
          },
        });
      }
      if (parsed.type === 'range') {
        const slice = await env.MEDIA.get(target.key, {
          range: { offset: parsed.offset, length: parsed.length },
        });
        if (!slice) return new Response('Not found.', { status: 404 });
        const headers = baseHeaders(meta);
        headers['Content-Range'] = `bytes ${parsed.start}-${parsed.end}/${meta.size}`;
        headers['Content-Length'] = String(parsed.length);
        return new Response(slice.body, { status: 206, headers });
      }
    }
  }

  const obj = await env.MEDIA.get(target.key);
  if (!obj) return new Response('Not found.', { status: 404 });
  const headers = baseHeaders(obj);
  if (etagMatches(request.headers.get('If-None-Match'), obj.httpEtag)) {
    return new Response(null, { status: 304, headers });
  }
  headers['Content-Length'] = String(obj.size);
  return new Response(obj.body, { status: 200, headers });
}

// Entry point used by the Workers runtime.
export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

// `deps` lets the tests replace fetch, the clock and the random id.
export async function handleRequest(request, env, deps = {}) {
  const url = new URL(request.url);

  if (url.pathname === '/media' || url.pathname.startsWith('/media/')) {
    try {
      return await serveMedia(request, url, env);
    } catch (err) {
      console.error(err);
      return new Response('Something went wrong.', { status: 500 });
    }
  }

  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigins(env);
  const cors = corsHeaders(origin, url, allowed);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    if (!url.pathname.startsWith('/api/')) return fail(cors, 404, 'Not found.');
    if (!isOriginAllowed(origin, url, allowed)) {
      return fail(cors, 403, 'This website is not allowed to use the admin.');
    }
    const repo = env.REPO || DEFAULT_REPO;
    if (!env.ADMIN_TOKEN || !env.GITHUB_TOKEN || !repo || !env.MEDIA) {
      return fail(
        cors,
        500,
        'The admin is not configured yet. Add ADMIN_TOKEN, GITHUB_TOKEN, and the MEDIA R2 bucket binding in Cloudflare.',
      );
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
      repo,
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
      const base = publicMediaBase(url, env);
      const publicUrl = `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
      return reply(cors, { key, url: publicUrl, kind: check.kind }, 201);
    }
    if (request.method === 'DELETE') {
      const body = await request.json().catch(() => null);
      const primaryBase = publicMediaBase(url, env);
      const key =
        keyFromPublicUrl(body?.url, primaryBase, slug) ??
        keyFromPublicUrl(body?.url, `${url.origin}/media`, slug);
      if (!key) return fail(cors, 400, 'That file does not belong to this profile.');
      await env.MEDIA.delete(key);
      return reply(cors, undefined, 204);
    }
    return fail(cors, 405, 'Method not allowed.');
  }

  return fail(cors, 404, 'Not found.');
}

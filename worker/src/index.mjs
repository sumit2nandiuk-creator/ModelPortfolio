// Admin API, private R2 media server, and live profile renderer for the portfolio sites.
// Runs on Cloudflare Pages Functions (/functions/*) or as a standalone Cloudflare Worker (worker/).
//
//   GET/HEAD /:slug/                         serve an R2-saved profile immediately (or fall through to static dist/)
//   GET/HEAD /media/:slug/:file              stream an uploaded photo or video from private R2 (public, cached, HTTP Range)
//   GET      /api/models                     list profiles from R2 + seed (requires Bearer ADMIN_TOKEN)
//   GET      /api/models/:slug               read one profile and its version token (requires Bearer ADMIN_TOKEN)
//   PUT      /api/models/:slug               save a profile directly to R2 — instant live update, zero deployments
//   DELETE   /api/models/:slug               archive, restore, or permanently delete a profile
//   POST     /api/models/:slug/media         upload a photo or video to R2 (requires Bearer ADMIN_TOKEN)
//   DELETE   /api/models/:slug/media         delete an uploaded file from R2 (requires Bearer ADMIN_TOKEN)
//
// Secrets (ADMIN_TOKEN) and the private R2 bucket binding (MEDIA) never leave the server.

import { coverList, renderModelPage } from '../../scripts/lib/render.mjs';
import {
  RESERVED_SLUGS,
  SLUG_PATTERN,
  bearerToken,
  checkUpload,
  constantTimeEqual,
  isHttpUrl,
  keyFromPublicUrl,
  mediaKeyFor,
  parseByteRange,
  parseMediaPath,
  validateModelShape,
} from './model.mjs';
import { getModelFile, HttpError, listModelSlugs } from './github.mjs';

const DEFAULT_REPO = 'sumit2nandiuk-creator/ModelPortfolio';
const PLACEHOLDER_R2_BASE = 'https://media.example.com';
const PROFILE_PREFIX = '_profiles/';
const PROFILE_STATE_PREFIX = '_profile-state/';
const ERROR_PREFIX = '_errors/';
const errorIngestWindows = new Map();
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const MEDIA_CACHE = 'public, max-age=31536000, immutable';
const PAGE_CACHE = 'public, max-age=0, must-revalidate';

function profileKeyFor(slug) {
  return `${PROFILE_PREFIX}${slug}.json`;
}

function profileStateKeyFor(slug) {
  return `${PROFILE_STATE_PREFIX}${slug}.json`;
}

async function profileState(bucket, slug) {
  const obj = await bucket.get(profileStateKeyFor(slug));
  if (!obj) return null;
  const value = await readObjectText(obj).catch(() => '');
  try {
    const state = JSON.parse(value).state;
    return state === 'archived' || state === 'deleted' ? state : null;
  } catch {
    return null;
  }
}

async function writeProfileState(bucket, slug, state) {
  await bucket.put(profileStateKeyFor(slug), JSON.stringify({ state }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
  });
}

async function listProfileStates(bucket) {
  const states = new Map();
  if (!bucket || typeof bucket.list !== 'function') return states;
  let cursor;
  do {
    const page = await bucket.list({ prefix: PROFILE_STATE_PREFIX, cursor });
    for (const item of page?.objects ?? []) {
      const key = String(item?.key ?? '');
      if (!key.startsWith(PROFILE_STATE_PREFIX) || !key.endsWith('.json')) continue;
      const slug = key.slice(PROFILE_STATE_PREFIX.length, -5);
      if (!SLUG_PATTERN.test(slug)) continue;
      const state = await profileState(bucket, slug);
      if (state) states.set(slug, state);
    }
    cursor = page?.truncated ? page.cursor : undefined;
  } while (cursor);
  return states;
}

async function deleteModelMedia(bucket, slug) {
  if (!bucket || typeof bucket.list !== 'function') return;
  const keys = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix: `${slug}/`, cursor });
    for (const item of page?.objects ?? []) {
      const key = String(item?.key ?? '');
      if (key.startsWith(`${slug}/`)) keys.push(key);
    }
    cursor = page?.truncated ? page.cursor : undefined;
  } while (cursor);
  await Promise.all(keys.map((key) => bucket.delete(key)));
}

function normalizeBasePath(base = '/') {
  let clean = String(base || '/').trim();
  if (!clean.startsWith('/')) clean = `/${clean}`;
  if (!clean.endsWith('/')) clean = `${clean}/`;
  return clean;
}

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

async function readObjectText(obj) {
  if (typeof obj.text === 'function') return obj.text();
  if (typeof obj.body === 'string') return obj.body;
  if (obj.body instanceof Uint8Array || obj.body instanceof ArrayBuffer) {
    return new TextDecoder().decode(obj.body);
  }
  return new Response(obj.body).text();
}

function safeLogText(value, max = 1200) {
  return String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').trim().slice(0, max);
}

function safeLogPath(value) {
  if (!value) return '';
  try { return new URL(String(value), 'https://errors.invalid').pathname.slice(0, 500); }
  catch { return String(value).split(/[?#]/)[0].slice(0, 500); }
}

function allowFrontendErrorReport(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  let window = errorIngestWindows.get(ip);
  if (!window || now - window.startedAt >= 60_000) {
    window = { startedAt: now, count: 0 };
    errorIngestWindows.set(ip, window);
  }
  if (window.count >= 60) return false;
  window.count += 1;
  if (errorIngestWindows.size > 2000) {
    for (const [key, value] of errorIngestWindows) {
      if (now - value.startedAt >= 60_000) errorIngestWindows.delete(key);
    }
  }
  return true;
}

async function persistApplicationError(env, entry) {
  if (!env?.MEDIA || typeof env.MEDIA.put !== 'function') return false;
  try {
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const id = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${now}-${Math.random().toString(36).slice(2, 12)}`;
    const inverted = String(Math.max(0, 9_999_999_999_999 - now)).padStart(13, '0');
    const record = {
      id,
      timestamp,
      source: safeLogText(entry.source || 'backend', 80),
      message: safeLogText(entry.message || 'Unknown application error'),
      path: safeLogPath(entry.path),
      details: entry.details && typeof entry.details === 'object' ? entry.details : {},
    };
    await env.MEDIA.put(`${ERROR_PREFIX}${inverted}-${id}.json`, JSON.stringify(record), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    });
    return true;
  } catch (err) {
    console.error('Could not persist application error.', err);
    return false;
  }
}

async function persistBackendError(env, request, err, details = {}) {
  const error = err instanceof Error ? err : new Error(String(err || 'Unknown backend error'));
  const url = request ? new URL(request.url) : null;
  return persistApplicationError(env, {
    source: 'backend',
    message: error.message,
    path: url?.pathname || '',
    details: {
      name: safeLogText(error.name, 100),
      stack: safeLogText(error.stack, 5000),
      method: request?.method || '',
      ...details,
    },
  });
}

function objectVersion(obj) {
  return obj?.customMetadata?.version || obj?.httpEtag || 'r2-current';
}

async function listStoredSlugs(bucket) {
  if (!bucket || typeof bucket.list !== 'function') return [];
  const slugs = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix: PROFILE_PREFIX, cursor });
    for (const item of page?.objects ?? []) {
      const key = String(item?.key ?? '');
      if (!key.startsWith(PROFILE_PREFIX) || !key.endsWith('.json')) continue;
      const slug = key.slice(PROFILE_PREFIX.length, -5);
      if (SLUG_PATTERN.test(slug)) slugs.push(slug);
    }
    cursor = page?.truncated ? page.cursor : undefined;
  } while (cursor);
  return slugs;
}

async function fetchAssetJson(url, env, assetPath) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') return null;
  const assetUrl = new URL(assetPath, url.origin);
  const res = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET' }));
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

async function readSeedSlugs(url, ctx) {
  const fromAssets = await fetchAssetJson(url, ctx.env, '/_seed/_index.json');
  let slugs = [];
  if (Array.isArray(fromAssets?.models)) {
    slugs = fromAssets.models.filter((slug) => SLUG_PATTERN.test(slug));
  } else if (ctx.token) {
    slugs = await listModelSlugs({
      repo: ctx.repo,
      branch: ctx.branch,
      token: ctx.token,
      fetchImpl: ctx.fetchImpl,
    });
  }
  return slugs;
}

async function readSeedProfile(url, ctx, slug) {
  if (await profileState(ctx.env.MEDIA, slug) === 'deleted') return null;
  const fromAssets = await fetchAssetJson(url, ctx.env, `/_seed/${encodeURIComponent(slug)}.json`);
  if (fromAssets && typeof fromAssets.model === 'object' && fromAssets.model) {
    return { model: fromAssets.model, sizes: fromAssets.sizes ?? {}, sha: 'seed' };
  }
  if (ctx.token) {
    const file = await getModelFile({
      repo: ctx.repo,
      branch: ctx.branch,
      token: ctx.token,
      fetchImpl: ctx.fetchImpl,
      slug,
    });
    if (file) return { model: file.model, sizes: {}, sha: file.sha };
  }
  return null;
}

function buildSizeMap(model, seedSizes = {}) {
  const sizes = new Map();
  for (const [file, dim] of Object.entries(seedSizes || {})) {
    if (dim?.width && dim?.height) sizes.set(file, { width: dim.width, height: dim.height });
  }
  for (const entry of [...coverList(model), ...(model.photos ?? [])]) {
    if (isHttpUrl(entry?.file) && entry.width && entry.height) {
      sizes.set(entry.file, { width: entry.width, height: entry.height });
    }
  }
  for (const video of model.videos ?? []) {
    if (isHttpUrl(video?.file) && video.width && video.height) {
      sizes.set(video.file, { width: video.width, height: video.height });
    }
    if (isHttpUrl(video?.poster) && video.posterWidth && video.posterHeight) {
      sizes.set(video.poster, { width: video.posterWidth, height: video.posterHeight });
    }
  }
  return sizes;
}

// Cloudflare Pages Function handler for /:slug and /:slug/ so R2-updated or newly
// created profiles go live immediately without rebuilding or redeploying the site.
export async function handleSeedMediaRequest(context) {
  const slug = String(context.params?.slug ?? '');
  if (!SLUG_PATTERN.test(slug)) return context.next();
  let state;
  try {
    state = await profileState(context.env.MEDIA, slug);
  } catch (err) {
    console.error(err);
    await persistBackendError(context.env, context.request, err, { status: 500, area: 'seed-media' });
    return new Response('Something went wrong.', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  if (state === 'archived' || state === 'deleted') {
    return new Response('This profile is not available.', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  return context.next();
}

export async function handleModelPageRequest(context, options = {}) {
  try {
    return await renderModelPageRequest(context, options);
  } catch (err) {
    console.error(err);
    await persistBackendError(context?.env, context?.request, err, { status: 500, area: 'profile-page' });
    return new Response('Something went wrong.', {
      status: 500,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
}

async function renderModelPageRequest(context, { trailingSlash = true } = {}) {
  const { request, env, params } = context;
  const rawSlug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  let slug = '';
  try {
    slug = decodeURIComponent(String(rawSlug ?? ''));
  } catch {
    return context.next();
  }
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug) || !env?.MEDIA) {
    return context.next();
  }

  const url = new URL(request.url);
  const base = normalizeBasePath(env.SITE_BASE_PATH);
  const state = await profileState(env.MEDIA, slug);
  if (state === 'archived' || state === 'deleted') {
    return new Response('This profile is not available.', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  if (!trailingSlash) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();
    const meta = await headObject(env.MEDIA, profileKeyFor(slug));
    if (!meta) return context.next();
    return Response.redirect(`${url.origin}${base}${encodeURIComponent(slug)}/${url.search}`, 308);
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const stored = await env.MEDIA.get(profileKeyFor(slug));
  if (!stored) return context.next();

  const version = objectVersion(stored);
  const etag = stored.httpEtag || `"${String(version).replace(/"/g, '')}"`;
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': PAGE_CACHE,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };

  if (etagMatches(request.headers.get('If-None-Match'), etag)) {
    return new Response(null, { status: 304, headers });
  }

  const model = JSON.parse(await readObjectText(stored));
  const seed = await fetchAssetJson(url, env, `/_seed/${encodeURIComponent(slug)}.json`);
  const sizes = buildSizeMap(model, seed?.sizes);
  const html = renderModelPage(model, {
    year: new Date().getUTCFullYear(),
    base,
    mediaUrl: (file) => (isHttpUrl(file) ? file : `${base}${slug}/media/${encodeURIComponent(file)}`),
    sizeOf: (file) => sizes.get(file) ?? null,
  });

  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
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
      const response = await serveMedia(request, url, env);
      if (response.status >= 500) {
        await persistApplicationError(env, {
          source: 'backend-media', message: `Media request failed with status ${response.status}`,
          path: url.pathname, details: { method: request.method, status: response.status },
        });
      }
      return response;
    } catch (err) {
      console.error(err);
      await persistBackendError(env, request, err, { status: 500, area: 'media' });
      return new Response('Something went wrong.', { status: 500 });
    }
  }

  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigins(env);
  const cors = corsHeaders(origin, url, allowed);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (url.pathname === '/api/errors' && request.method === 'POST') {
    if (!origin || !isOriginAllowed(origin, url, allowed)) {
      return fail(cors, 403, 'Error reports must be sent from this site.');
    }
    if (!env.MEDIA) return fail(cors, 503, 'Error storage is not configured.');
    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > 8192) return fail(cors, 413, 'Error report is too large.');
    const raw = await request.text().catch(() => '');
    if (new TextEncoder().encode(raw).byteLength > 8192) return fail(cors, 413, 'Error report is too large.');
    const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
    if (!body || typeof body !== 'object' || typeof body.message !== 'string' || !body.message.trim()) {
      return fail(cors, 400, 'Send an error message as JSON.');
    }
    if (!allowFrontendErrorReport(request)) return fail(cors, 429, 'Too many error reports. Try again later.');
    const source = /^frontend(?:-[a-z-]+)?$/.test(String(body.source || '')) ? body.source : 'frontend';
    const rawDetails = body.details && typeof body.details === 'object' ? body.details : {};
    const details = {
      name: safeLogText(rawDetails.name, 100),
      file: safeLogPath(rawDetails.file),
      resource: safeLogPath(rawDetails.resource),
      line: Number(rawDetails.line) || undefined,
      column: Number(rawDetails.column) || undefined,
      stack: safeLogText(rawDetails.stack, 4000),
    };
    const stored = await persistApplicationError(env, {
      source,
      message: body.message,
      path: safeLogPath(body.path),
      details,
    });
    return new Response(stored ? null : 'Could not store error report.', {
      status: stored ? 202 : 503,
      headers: { ...cors, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  try {
    if (!url.pathname.startsWith('/api/')) return fail(cors, 404, 'Not found.');
    if (!isOriginAllowed(origin, url, allowed)) {
      return fail(cors, 403, 'This website is not allowed to use the admin.');
    }
    if (!env.ADMIN_TOKEN || !env.MEDIA) {
      await persistApplicationError(env, {
        source: 'backend-config',
        message: 'Admin API is not configured: ADMIN_TOKEN or MEDIA binding is missing.',
        path: url.pathname,
        details: { method: request.method, status: 500 },
      });
      return fail(
        cors,
        500,
        'The admin is not configured yet. Add ADMIN_TOKEN and the MEDIA R2 bucket binding in Cloudflare.',
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
      repo: env.REPO || DEFAULT_REPO,
      branch: env.BRANCH || 'main',
      token: env.GITHUB_TOKEN || '',
    };
    const response = await route(request, url, ctx);
    if (response.status >= 400) {
      const body = await response.clone().json().catch(() => ({}));
      await persistApplicationError(env, {
        source: 'backend-api',
        message: body.error || `API request failed with status ${response.status}`,
        path: url.pathname,
        details: { status: response.status, method: request.method },
      });
    }
    return response;
  } catch (err) {
    if (err instanceof HttpError) {
      await persistBackendError(env, request, err, { status: err.status });
      return fail(cors, err.status, err.message);
    }
    console.error(err);
    await persistBackendError(env, request, err, { status: 500 });
    return fail(cors, 500, 'Something went wrong. Please try again.');
  }
}

async function route(request, url, ctx) {
  const { cors, env } = ctx;
  const parts = url.pathname.split('/').filter(Boolean); // ["api", "models", slug?, "media"?]

  if (parts[1] === 'errors') {
    if (parts.length !== 2 || request.method !== 'GET') return fail(cors, 405, 'Method not allowed.');
    if (typeof env.MEDIA.list !== 'function') return fail(cors, 503, 'Error storage cannot list records.');
    const requestedLimit = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
    const cursor = url.searchParams.get('cursor') || undefined;
    if (cursor && (cursor.length > 2048 || /[\x00-\x1f]/.test(cursor))) {
      return fail(cors, 400, 'That error-log cursor is invalid.');
    }
    const page = await env.MEDIA.list({ prefix: ERROR_PREFIX, limit, cursor });
    const errors = await Promise.all((page?.objects || []).map(async (item) => {
      const object = await env.MEDIA.get(item.key);
      if (!object) return null;
      try { return JSON.parse(await readObjectText(object)); } catch { return null; }
    }));
    return reply(cors, {
      errors: errors.filter(Boolean),
      nextCursor: page?.truncated ? page.cursor || null : null,
    });
  }

  if (parts[1] !== 'models') return fail(cors, 404, 'Not found.');

  if (parts.length === 2) {
    if (request.method !== 'GET') return fail(cors, 405, 'Method not allowed.');
    const [storedSlugs, seedSlugs, states] = await Promise.all([
      listStoredSlugs(env.MEDIA),
      readSeedSlugs(url, ctx),
      listProfileStates(env.MEDIA),
    ]);
    const models = [...new Set([...storedSlugs, ...seedSlugs])]
      .filter((slug) => states.get(slug) !== 'deleted')
      .sort();
    const archived = models.filter((slug) => states.get(slug) === 'archived');
    return reply(cors, { models, archived });
  }

  const slug = decodeURIComponent(parts[2] ?? '');
  if (!SLUG_PATTERN.test(slug)) return fail(cors, 400, 'That profile address is not valid.');

  if (parts.length === 3) {
    if (request.method === 'GET') {
      if (await profileState(env.MEDIA, slug) === 'deleted') {
        return fail(cors, 404, 'That profile was permanently deleted.');
      }
      const stored = await env.MEDIA.get(profileKeyFor(slug));
      if (stored) {
        const model = JSON.parse(await readObjectText(stored));
        return reply(cors, { model, sha: objectVersion(stored) });
      }
      const seed = await readSeedProfile(url, ctx, slug);
      if (!seed) return fail(cors, 404, 'That profile does not exist.');
      return reply(cors, { model: seed.model, sha: seed.sha });
    }

    if (request.method === 'PUT') {
      if (await profileState(env.MEDIA, slug) === 'deleted') {
        return fail(cors, 410, 'This profile was permanently deleted and cannot be restored.');
      }
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') return fail(cors, 400, 'Send the profile as JSON.');
      const errors = validateModelShape(body.model, slug);
      if (errors.length) return fail(cors, 400, errors[0], { errors });

      const profileKey = profileKeyFor(slug);
      const existingStored = await headObject(env.MEDIA, profileKey);
      if (existingStored) {
        if (!body.sha) {
          return fail(cors, 409, 'A profile with this address already exists. Open it from the list instead.');
        }
        if (body.sha !== objectVersion(existingStored)) {
          return fail(
            cors,
            409,
            'This profile changed since you opened it. Reload it, then apply your changes again.',
          );
        }
      } else {
        const seed = await readSeedProfile(url, ctx, slug);
        if (seed) {
          if (!body.sha) {
            return fail(cors, 409, 'A profile with this address already exists. Open it from the list instead.');
          }
          if (body.sha !== seed.sha) {
            return fail(
              cors,
              409,
              'This profile changed since you opened it. Reload it, then apply your changes again.',
            );
          }
        } else if (body.sha) {
          return fail(
            cors,
            409,
            'This profile changed since you opened it. Reload it, then apply your changes again.',
          );
        }
      }

      const newVersion = `v-${ctx.now()}-${ctx.randomId()}`;
      await env.MEDIA.put(profileKey, `${JSON.stringify(body.model, null, 2)}\n`, {
        httpMetadata: {
          contentType: 'application/json; charset=utf-8',
          cacheControl: 'no-store',
        },
        customMetadata: { version: newVersion },
      });
      return reply(cors, { sha: newVersion });
    }

    if (request.method === 'DELETE') {
      const body = await request.json().catch(() => null);
      const action = body?.action;
      const state = await profileState(env.MEDIA, slug);
      if (action === 'archive') {
        if (state === 'deleted') return fail(cors, 410, 'This profile was permanently deleted.');
        await writeProfileState(env.MEDIA, slug, 'archived');
        return reply(cors, { state: 'archived' });
      }
      if (action === 'restore') {
        if (state === 'deleted') return fail(cors, 410, 'This profile was permanently deleted.');
        await env.MEDIA.delete(profileStateKeyFor(slug));
        return reply(cors, { state: 'active' });
      }
      if (action === 'permanent') {
        const existing = await headObject(env.MEDIA, profileKeyFor(slug));
        if (body?.sha && existing && body.sha !== objectVersion(existing)) {
          return fail(cors, 409, 'This profile changed since you opened it. Reload it before permanent deletion.');
        }
        await writeProfileState(env.MEDIA, slug, 'deleted');
        await deleteModelMedia(env.MEDIA, slug);
        await env.MEDIA.delete(profileKeyFor(slug));
        return reply(cors, { state: 'deleted' });
      }
      return fail(cors, 400, 'Choose archive, restore or permanent deletion.');
    }
    return fail(cors, 405, 'Method not allowed.');
  }

  if (parts.length === 4 && parts[3] === 'media') {
    if (request.method === 'GET') {
      const rawSource = url.searchParams.get('url') || '';
      let source;
      try {
        const parsedSource = new URL(rawSource);
        source = `${parsedSource.origin}${parsedSource.pathname}`;
      } catch {
        return fail(cors, 400, 'That image URL is not valid.');
      }
      const primaryBase = publicMediaBase(url, env);
      const key = keyFromPublicUrl(source, primaryBase, slug) ??
        keyFromPublicUrl(source, `${url.origin}/media`, slug);
      if (!key || key.split('/').length !== 2) return fail(cors, 404, 'That image is not stored in this profile.');
      const file = key.split('/')[1];
      const target = parseMediaPath(`/media/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`);
      if (!target || !target.contentType.startsWith('image/')) {
        return fail(cors, 400, 'Only profile images can be used to generate thumbnails.');
      }
      const object = await env.MEDIA.get(key);
      if (!object) return fail(cors, 404, 'That image is not stored in this profile.');
      return new Response(object.body, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': object.httpMetadata?.contentType || target.contentType,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (request.method === 'POST') {
      const form = await request.formData().catch(() => null);
      const file = form?.get('file');
      if (!file || typeof file !== 'object' || typeof file.size !== 'number') {
        return fail(cors, 400, 'Choose a file to upload.');
      }
      const check = checkUpload({ name: file.name, size: file.size, type: file.type });
      if (!check.ok) return fail(cors, 400, check.error);

      const key = mediaKeyFor(slug, check.normalizedName || file.name, ctx.now(), ctx.randomId());
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

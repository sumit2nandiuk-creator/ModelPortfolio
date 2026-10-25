// Tests for the admin Worker & Cloudflare Pages Functions.
// R2, static ASSETS, and GitHub are replaced with small fakes, so nothing leaves
// the machine and no real secrets are needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  base64ToUtf8,
  checkUpload,
  constantTimeEqual,
  keyFromPublicUrl,
  mediaKeyFor,
  parseByteRange,
  parseMediaPath,
  utf8ToBase64,
  validateModelShape,
} from '../worker/src/model.mjs';
import { handleRequest } from '../worker/src/index.mjs';
import { onRequest as onApiRequest } from '../functions/api/[[path]].js';
import { onRequest as onMediaRequest } from '../functions/media/[[path]].js';
import { onRequest as onSlugPageRequest } from '../functions/[slug]/index.js';
import { onRequest as onSlugBareRequest } from '../functions/[slug].js';
import { onRequest as onSeedRequest } from '../functions/_seed/[[path]].js';

const ORIGIN = 'https://admin.example.test';
const BASE = 'https://media.example.test';
const TOKEN = 'correct-horse-battery';

function validModel(overrides = {}) {
  return {
    slug: 'jane-doe',
    name: 'Jane Doe',
    cover: { file: `${BASE}/jane-doe/1-abc-cover.jpg`, alt: 'Jane in a red saree' },
    photos: [{ file: `${BASE}/jane-doe/2-def-photo.jpg`, title: 'Bridal', category: 'Bridal', year: '2026' }],
    videos: [{ file: `${BASE}/jane-doe/3-ghi-reel.mp4`, title: 'Reel', category: 'Showreel' }],
    contact: { email: 'jane@example.com', phone: '+91 98765 43210' },
    ...overrides,
  };
}

// --- Pure helpers ----------------------------------------------------------

test('a complete profile passes the shape check', () => {
  assert.deepEqual(validateModelShape(validModel(), 'jane-doe'), []);
});

test('the shape check reports missing cover, bad email and a changed slug', () => {
  const errors = validateModelShape(validModel({ cover: undefined, contact: { email: 'nope' } }), 'other');
  assert.ok(errors.some((e) => /cover photo/i.test(e)));
  assert.ok(errors.some((e) => /email/i.test(e)));
  assert.ok(errors.some((e) => /must stay "other"/.test(e)));
});

test('the shape check rejects reserved slugs and photos without a title', () => {
  const errors = validateModelShape(validModel({ slug: 'admin', photos: [{ file: 'a.jpg', category: 'x' }] }));
  assert.ok(errors.some((e) => /reserved/.test(e)));
  assert.ok(errors.some((e) => /Photo 1 needs a title/.test(e)));
});

test('uploads: images and videos are allowed, other types and oversize files are not', () => {
  assert.equal(checkUpload({ name: 'Bridal.JPG', size: 1000 }).kind, 'image');
  assert.equal(checkUpload({ name: 'reel.mp4', size: 1000 }).contentType, 'video/mp4');
  // iPhone gallery .MOV videos and extensionless Android gallery files with MIME types work cleanly.
  assert.equal(checkUpload({ name: 'IMG_4821.MOV', size: 12 * 1024 * 1024 }).contentType, 'video/quicktime');
  const androidVideo = checkUpload({ name: '1000048291', size: 5 * 1024 * 1024, type: 'video/mp4' });
  assert.equal(androidVideo.ok, true);
  assert.equal(androidVideo.normalizedName, '1000048291.mp4');
  assert.equal(parseMediaPath('/media/jane-doe/1700000-abcd-img-4821.mov')?.contentType, 'video/quicktime');
  assert.equal(checkUpload({ name: 'run.exe', size: 1000 }).ok, false);
  assert.equal(checkUpload({ name: 'huge.jpg', size: 26 * 1024 * 1024 }).ok, false);
  assert.equal(checkUpload({ name: 'big.mp4', size: 90 * 1024 * 1024 }).ok, true);
});

test('storage keys start with the model slug and are sanitised', () => {
  const key = mediaKeyFor('jane-doe', 'My Bridal Shot (final).JPG', 1700000000000, 'abcd1234');
  assert.equal(key, 'jane-doe/1700000000000-abcd1234-my-bridal-shot-final.jpg');
  assert.equal(mediaKeyFor('jane-doe', '!!!.png', 1, 'x').endsWith('-file.png'), true);
});

test('a public URL maps back to a key only inside the same model folder', () => {
  assert.equal(keyFromPublicUrl(`${BASE}/jane-doe/1-a-cover.jpg`, `${BASE}/`, 'jane-doe'), 'jane-doe/1-a-cover.jpg');
  assert.equal(keyFromPublicUrl(`${BASE}/other/1-a-cover.jpg`, BASE, 'jane-doe'), null);
  assert.equal(keyFromPublicUrl(`${BASE}/jane-doe/../secret.jpg`, BASE, 'jane-doe'), null);
  assert.equal(keyFromPublicUrl('https://elsewhere.test/jane-doe/x.jpg', BASE, 'jane-doe'), null);
  assert.equal(keyFromPublicUrl(`${BASE}/jane-doe/%E0%A4%A`, BASE, 'jane-doe'), null);
});

test('base64 round-trips non-ASCII text and the token comparison is exact', () => {
  const text = '{"name":"সুস্মিতা ঘোষ","bio":["Editorial · Runway"]}';
  assert.equal(base64ToUtf8(utf8ToBase64(text)), text);
  assert.equal(constantTimeEqual('abc', 'abc'), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);
});

// --- HTTP handler with fakes ----------------------------------------------

function fakeBucket() {
  const objects = new Map();
  let writeSeq = 0;
  async function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value && typeof value.arrayBuffer === 'function') {
      return new Uint8Array(await value.arrayBuffer());
    }
    return new Uint8Array(0);
  }
  return {
    objects,
    async put(key, value, options = {}) {
      const bytes = await toBytes(value);
      writeSeq += 1;
      objects.set(key, {
        value,
        bytes,
        options,
        httpEtag: `"etag-${writeSeq}-${key}"`,
      });
    },
    async head(key) {
      const entry = objects.get(key);
      if (!entry) return null;
      const bytes = entry.bytes ?? (await toBytes(entry.value));
      return {
        size: bytes.byteLength,
        httpEtag: entry.httpEtag ?? `"etag-${key}"`,
        httpMetadata: entry.options?.httpMetadata ?? {},
        customMetadata: entry.options?.customMetadata ?? {},
      };
    },
    async get(key, opts = {}) {
      const entry = objects.get(key);
      if (!entry) return null;
      const bytes = entry.bytes ?? (await toBytes(entry.value));
      const slice = opts.range
        ? bytes.subarray(opts.range.offset, opts.range.offset + opts.range.length)
        : bytes;
      return {
        body: slice,
        size: bytes.byteLength,
        httpEtag: entry.httpEtag ?? `"etag-${key}"`,
        httpMetadata: entry.options?.httpMetadata ?? {},
        customMetadata: entry.options?.customMetadata ?? {},
        async text() {
          return new TextDecoder().decode(slice);
        },
      };
    },
    async list({ prefix = '' } = {}) {
      const listObjects = [];
      for (const [key, entry] of objects.entries()) {
        if (key.startsWith(prefix)) {
          listObjects.push({ key, size: entry.bytes?.byteLength ?? 0 });
        }
      }
      return { objects: listObjects, truncated: false };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function fakeAssets(files = {}) {
  return {
    async fetch(request) {
      const url = new URL(typeof request === 'string' ? request : request.url);
      const entry = files[url.pathname];
      if (!entry) return new Response('Not found', { status: 404 });
      if (typeof entry === 'string') {
        return new Response(entry, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return new Response(JSON.stringify(entry), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    },
  };
}

function fakeEnv(overrides = {}) {
  return {
    ADMIN_TOKEN: TOKEN,
    GITHUB_TOKEN: '',
    REPO: 'owner/site',
    BRANCH: 'main',
    R2_PUBLIC_BASE: BASE,
    ADMIN_ORIGIN: ORIGIN,
    MEDIA: fakeBucket(),
    ...overrides,
  };
}

// A fake GitHub Contents API (used only for optional read-only seed fallback when ASSETS is absent).
function fakeGithub(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    return handler(String(url), init);
  };
  return { fetchImpl, calls };
}

const json = (body, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function apiRequest(method, pathname, { body, form, token = TOKEN, origin = ORIGIN } = {}) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return new Request(`https://admin.example.test${pathname}`, { method, headers, body: payload });
}

test('requests without the admin token are refused', async () => {
  const res = await handleRequest(apiRequest('GET', '/api/models', { token: '' }), fakeEnv());
  assert.equal(res.status, 401);
});

test('a wrong admin token is refused', async () => {
  const res = await handleRequest(apiRequest('GET', '/api/models', { token: 'nope' }), fakeEnv());
  assert.equal(res.status, 401);
});

test('other websites get no CORS permission and are refused', async () => {
  const res = await handleRequest(apiRequest('GET', '/api/models', { origin: 'https://evil.test' }), fakeEnv());
  assert.equal(res.status, 403);
});

test('the preflight answers the allowed origin only', async () => {
  const ok = await handleRequest(new Request('https://x.test/api/models', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), fakeEnv());
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const other = await handleRequest(new Request('https://x.test/api/models', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }), fakeEnv());
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
});

test('an unconfigured Worker says so instead of failing silently', async () => {
  const res = await handleRequest(apiRequest('GET', '/api/models'), fakeEnv({ MEDIA: null }));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /not configured/);
});

test('listing models merges R2-saved profiles with build seed profiles without calling GitHub', async () => {
  const env = fakeEnv({
    ASSETS: fakeAssets({
      '/_seed/_index.json': { models: ['sushmita-ghosh', '_template'] },
    }),
  });
  await env.MEDIA.put('_profiles/jane-doe.json', JSON.stringify(validModel()), {
    customMetadata: { version: 'v-1' },
  });
  const gh = fakeGithub(() => json([], 500));
  const res = await handleRequest(apiRequest('GET', '/api/models'), env, { fetch: gh.fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).models, ['jane-doe', 'sushmita-ghosh']);
  assert.equal(gh.calls.length, 0);
});

test('reading a profile reads R2 overrides first and falls back to build seed without GITHUB_TOKEN', async () => {
  const seedModel = validModel({ slug: 'sushmita-ghosh', name: 'Sushmita Seed' });
  const env = fakeEnv({
    ASSETS: fakeAssets({
      '/_seed/sushmita-ghosh.json': { model: seedModel, sizes: { 'cover.jpg': { width: 800, height: 1200 } } },
    }),
  });

  // Unedited profile comes from build seed.
  const seedRes = await handleRequest(apiRequest('GET', '/api/models/sushmita-ghosh'), env);
  const seedBody = await seedRes.json();
  assert.equal(seedRes.status, 200);
  assert.equal(seedBody.sha, 'seed');
  assert.equal(seedBody.model.name, 'Sushmita Seed');

  // Unknown profile returns 404.
  const missing = await handleRequest(apiRequest('GET', '/api/models/nobody'), env);
  assert.equal(missing.status, 404);
});

test('saving a profile stores it in R2 with zero GitHub commits (no Cloudflare deployment triggered)', async () => {
  const seedModel = validModel();
  const env = fakeEnv({
    GITHUB_TOKEN: 'present-but-must-never-be-written-to',
    ASSETS: fakeAssets({
      '/_seed/_index.json': { models: ['jane-doe'] },
      '/_seed/jane-doe.json': { model: seedModel, sizes: {} },
    }),
  });
  const gh = fakeGithub(() => {
    throw new Error('GitHub API must never be called when saving to R2');
  });

  // Invalid profile is rejected before anything is written to R2.
  const bad = await handleRequest(
    apiRequest('PUT', '/api/models/jane-doe', { body: { sha: 'seed', model: validModel({ cover: undefined }) } }),
    env,
    { fetch: gh.fetchImpl },
  );
  assert.equal(bad.status, 400);
  assert.equal(env.MEDIA.objects.size, 0);

  // Valid update writes directly to R2 (_profiles/jane-doe.json) and returns a new version token.
  const updatedModel = validModel({ name: 'Jane Q. Doe' });
  const ok = await handleRequest(
    apiRequest('PUT', '/api/models/jane-doe', { body: { sha: 'seed', model: updatedModel } }),
    env,
    { fetch: gh.fetchImpl, now: () => 1700000000000, randomId: () => 'abcd1234' },
  );
  assert.equal(ok.status, 200);
  const { sha } = await ok.json();
  assert.equal(sha, 'v-1700000000000-abcd1234');
  assert.equal(gh.calls.length, 0, 'zero GitHub commits means zero Cloudflare Pages deployments');

  // Subsequent GET reads the updated R2 profile immediately.
  const readBack = await handleRequest(apiRequest('GET', '/api/models/jane-doe'), env, { fetch: gh.fetchImpl });
  const readBody = await readBack.json();
  assert.equal(readBody.sha, sha);
  assert.equal(readBody.model.name, 'Jane Q. Doe');

  //_profiles/* cannot be downloaded through public /media/*.
  const mediaAttempt = await onMediaRequest({
    request: new Request('https://modelportfolio.pages.dev/media/_profiles/jane-doe.json'),
    env,
  });
  assert.equal(mediaAttempt.status, 404);
});

test('creating a new profile and optimistic concurrency conflict checks work in R2', async () => {
  const env = fakeEnv({
    ASSETS: fakeAssets({
      '/_seed/_index.json': { models: ['existing-seed'] },
      '/_seed/existing-seed.json': { model: validModel({ slug: 'existing-seed' }), sizes: {} },
    }),
  });

  // Creating over an existing seed slug without sha -> 409 clash.
  const seedClash = await handleRequest(
    apiRequest('PUT', '/api/models/existing-seed', { body: { model: validModel({ slug: 'existing-seed' }) } }),
    env,
  );
  assert.equal(seedClash.status, 409);

  // Creating a brand-new profile without sha succeeds immediately.
  const created = await handleRequest(
    apiRequest('PUT', '/api/models/new-person', { body: { model: validModel({ slug: 'new-person', name: 'New Person' }) } }),
    env,
    { now: () => 100, randomId: () => 'v1' },
  );
  assert.equal(created.status, 200);
  const { sha: firstSha } = await created.json();

  // Creating again with the same slug without sha -> 409 clash.
  const r2Clash = await handleRequest(
    apiRequest('PUT', '/api/models/new-person', { body: { model: validModel({ slug: 'new-person' }) } }),
    env,
  );
  assert.equal(r2Clash.status, 409);

  // Editing with a stale sha -> 409 conflict, not overwritten.
  const stale = await handleRequest(
    apiRequest('PUT', '/api/models/new-person', {
      body: { sha: 'stale-version', model: validModel({ slug: 'new-person', name: 'Wrong' }) },
    }),
    env,
  );
  assert.equal(stale.status, 409);
  assert.match((await stale.json()).error, /changed since you opened it/);

  // Editing with the current sha succeeds.
  const second = await handleRequest(
    apiRequest('PUT', '/api/models/new-person', {
      body: { sha: firstSha, model: validModel({ slug: 'new-person', name: 'Updated Person' }) },
    }),
    env,
    { now: () => 200, randomId: () => 'v2' },
  );
  assert.equal(second.status, 200);
});

test('Pages Function /:slug/ renders R2-saved edits and new profiles live immediately', async () => {
  const env = fakeEnv({
    ADMIN_ORIGIN: '',
    ASSETS: fakeAssets({
      '/404.html': '<!doctype html><title>Not found</title>',
      '/_seed/sushmita-ghosh.json': {
        model: validModel({ slug: 'sushmita-ghosh', name: 'Original Name' }),
        sizes: { 'cover.jpg': { width: 900, height: 1350 } },
      },
    }),
  });

  // 1. Before any R2 edit, /:slug/ falls through via context.next() to static CDN HTML.
  let fellThrough = false;
  const untouched = await onSlugPageRequest({
    request: new Request('https://modelportfolio.pages.dev/sushmita-ghosh/'),
    env,
    params: { slug: 'sushmita-ghosh' },
    next: async () => {
      fellThrough = true;
      return new Response('static-cdn-html', { status: 200 });
    },
  });
  assert.equal(fellThrough, true);
  assert.equal(await untouched.text(), 'static-cdn-html');

  // 2. Save an edit via /api/models/sushmita-ghosh (mixing local repo cover.jpg + hosted photo).
  const editedModel = validModel({
    slug: 'sushmita-ghosh',
    name: 'Sushmita Live Updated',
    tagline: 'Instant R2 Editorial',
    cover: { file: 'cover.jpg', alt: 'Sushmita cover' },
    photos: [
      {
        file: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/1-bridal.jpg',
        title: 'Royal Bridal',
        category: 'Bridal',
        width: 1080,
        height: 1620,
      },
    ],
    videos: [],
  });
  const saveRes = await onApiRequest({
    request: new Request('https://modelportfolio.pages.dev/api/models/sushmita-ghosh', {
      method: 'PUT',
      headers: {
        Origin: 'https://modelportfolio.pages.dev',
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sha: 'seed', model: editedModel }),
    }),
    env,
  });
  assert.equal(saveRes.status, 200);

  // 3. /:slug (no trailing slash) redirects 308 -> /:slug/ for R2-stored profiles.
  const bareRes = await onSlugBareRequest({
    request: new Request('https://modelportfolio.pages.dev/sushmita-ghosh'),
    env,
    params: { slug: 'sushmita-ghosh' },
    next: async () => new Response('not-used', { status: 404 }),
  });
  assert.equal(bareRes.status, 308);
  assert.equal(bareRes.headers.get('Location'), 'https://modelportfolio.pages.dev/sushmita-ghosh/');

  // 4. /:slug/ immediately renders the updated HTML with both seed dimensions and hosted dimensions!
  const liveRes = await onSlugPageRequest({
    request: new Request('https://modelportfolio.pages.dev/sushmita-ghosh/'),
    env,
    params: { slug: 'sushmita-ghosh' },
    next: async () => new Response('stale-static-html', { status: 200 }),
  });
  assert.equal(liveRes.status, 200);
  assert.equal(liveRes.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
  const html = await liveRes.text();
  assert.match(html, /Sushmita Live Updated/);
  assert.match(html, /Instant R2 Editorial/);
  assert.match(html, /src="\/sushmita-ghosh\/media\/cover\.jpg"[^>]*width="900" height="1350"/);
  assert.match(
    html,
    /src="https:\/\/modelportfolio\.pages\.dev\/media\/sushmita-ghosh\/1-bridal\.jpg"[^>]*width="1080" height="1620"/,
  );

  // 5. Conditional GET with matching ETag returns instant 304 Not Modified.
  const etag = liveRes.headers.get('ETag');
  assert.ok(etag);
  const notModified = await onSlugPageRequest({
    request: new Request('https://modelportfolio.pages.dev/sushmita-ghosh/', {
      headers: { 'If-None-Match': etag },
    }),
    env,
    params: { slug: 'sushmita-ghosh' },
    next: async () => new Response('unused'),
  });
  assert.equal(notModified.status, 304);

  // 6. Reserved paths (/admin/) always delegate to static assets via next().
  let adminDelegated = false;
  await onSlugPageRequest({
    request: new Request('https://modelportfolio.pages.dev/admin/'),
    env,
    params: { slug: 'admin' },
    next: async () => {
      adminDelegated = true;
      return new Response('admin-ui', { status: 200 });
    },
  });
  assert.equal(adminDelegated, true);

  // 7. Public HTTP requests to /_seed/* are blocked with 404.
  const seedBlocked = await onSeedRequest({
    request: new Request('https://modelportfolio.pages.dev/_seed/_index.json'),
    env,
  });
  assert.equal(seedBlocked.status, 404);
});

test('standalone Worker still supports read-only GitHub fallback when ASSETS is absent', async () => {
  const model = validModel();
  const gh = fakeGithub((url) => {
    if (url.includes('/contents/models?')) {
      return json([{ name: 'jane-doe', type: 'dir' }, { name: '_template', type: 'dir' }]);
    }
    return json({ sha: 'git-sha-1', content: utf8ToBase64(JSON.stringify(model)) });
  });
  const env = fakeEnv({ GITHUB_TOKEN: 'gh-read-token' });

  const listRes = await handleRequest(apiRequest('GET', '/api/models'), env, { fetch: gh.fetchImpl });
  assert.deepEqual((await listRes.json()).models, ['jane-doe']);

  const getRes = await handleRequest(apiRequest('GET', '/api/models/jane-doe'), env, { fetch: gh.fetchImpl });
  const getBody = await getRes.json();
  assert.equal(getBody.sha, 'git-sha-1');
  assert.deepEqual(getBody.model, model);
});

test('uploading a photo stores it in R2 under the model folder and returns its public URL', async () => {
  const env = fakeEnv();
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'Bridal Look.jpg', { type: 'image/jpeg' }));
  const res = await handleRequest(apiRequest('POST', '/api/models/jane-doe/media', { form }), env, {
    now: () => 1700000000000,
    randomId: () => 'abcd1234',
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.key, 'jane-doe/1700000000000-abcd1234-bridal-look.jpg');
  assert.equal(body.url, `${BASE}/jane-doe/1700000000000-abcd1234-bridal-look.jpg`);
  const stored = env.MEDIA.objects.get(body.key);
  assert.ok(stored, 'object is in the bucket');
  assert.equal(stored.options.httpMetadata.contentType, 'image/jpeg');
});

test('uploading an unsupported file type is refused and nothing is stored', async () => {
  const env = fakeEnv();
  const form = new FormData();
  form.append('file', new File(['MZ'], 'virus.exe', { type: 'application/octet-stream' }));
  const res = await handleRequest(apiRequest('POST', '/api/models/jane-doe/media', { form }), env);
  assert.equal(res.status, 400);
  assert.equal(env.MEDIA.objects.size, 0);
});

test('deleting a file removes it from R2 only when it belongs to that profile', async () => {
  const env = fakeEnv();
  env.MEDIA.objects.set('jane-doe/1-a-cover.jpg', { value: 'x' });
  env.MEDIA.objects.set('other/1-b-cover.jpg', { value: 'y' });

  const bad = await handleRequest(
    apiRequest('DELETE', '/api/models/jane-doe/media', { body: { url: `${BASE}/other/1-b-cover.jpg` } }),
    env,
  );
  assert.equal(bad.status, 400);
  assert.equal(env.MEDIA.objects.has('other/1-b-cover.jpg'), true);

  const ok = await handleRequest(
    apiRequest('DELETE', '/api/models/jane-doe/media', { body: { url: `${BASE}/jane-doe/1-a-cover.jpg` } }),
    env,
  );
  assert.equal(ok.status, 204);
  assert.equal(env.MEDIA.objects.has('jane-doe/1-a-cover.jpg'), false);
});

test('an invalid profile address is rejected before any storage call', async () => {
  const gh = fakeGithub(() => json({}));
  const res = await handleRequest(apiRequest('GET', '/api/models/Bad_Name'), fakeEnv(), { fetch: gh.fetchImpl });
  assert.equal(res.status, 400);
  assert.equal(gh.calls.length, 0);
});

test('parseMediaPath and parseByteRange validate paths and HTTP byte ranges', () => {
  assert.deepEqual(parseMediaPath('/media/jane-doe/1-abc-reel.mp4'), {
    slug: 'jane-doe',
    file: '1-abc-reel.mp4',
    key: 'jane-doe/1-abc-reel.mp4',
    contentType: 'video/mp4',
  });
  assert.equal(parseMediaPath('/media/admin/1-abc-reel.mp4'), null);
  assert.equal(parseMediaPath('/media/_profiles/jane-doe.json'), null);
  assert.equal(parseMediaPath('/media/jane-doe/../secret.jpg'), null);
  assert.equal(parseMediaPath('/media/jane-doe/script.js'), null);

  assert.deepEqual(parseByteRange('bytes=0-1', 100), { type: 'range', offset: 0, length: 2, start: 0, end: 1 });
  assert.deepEqual(parseByteRange('bytes=90-', 100), { type: 'range', offset: 90, length: 10, start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-15', 100), { type: 'range', offset: 85, length: 15, start: 85, end: 99 });
  assert.deepEqual(parseByteRange('bytes=100-120', 100), { type: 'unsatisfiable' });
  assert.deepEqual(parseByteRange('bytes=20-10', 100), { type: 'none' });
  assert.deepEqual(parseByteRange('bytes=0-1, 4-5', 100), { type: 'none' });
});

test('without R2_PUBLIC_BASE, uploads return same-app /media/ URLs (canonicalised on pages.dev) and stream with Range support', async () => {
  const env = fakeEnv({ R2_PUBLIC_BASE: '', ADMIN_ORIGIN: '' });
  const bytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
  const form = new FormData();
  form.append('file', new File([bytes], 'Showreel 2026.mp4', { type: 'video/mp4' }));

  // Upload from a Cloudflare Pages preview hash subdomain -> saved URL uses canonical production domain.
  const uploadReq = new Request('https://1857063f.modelportfolio.pages.dev/api/models/sushmita-ghosh/media', {
    method: 'POST',
    headers: {
      Origin: 'https://1857063f.modelportfolio.pages.dev',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: form,
  });
  const uploadRes = await onApiRequest({ request: uploadReq, env });
  const uploaded = await uploadRes.json();
  assert.equal(uploadRes.status, 201);
  assert.match(uploaded.url, /^https:\/\/modelportfolio\.pages\.dev\/media\/sushmita-ghosh\/.+-showreel-2026\.mp4$/);

  // Public visitors can GET, HEAD, and Range-stream /media/* without any admin token.
  const fullRes = await onMediaRequest({ request: new Request(uploaded.url), env });
  assert.equal(fullRes.status, 200);
  assert.equal(fullRes.headers.get('Content-Type'), 'video/mp4');
  assert.equal(fullRes.headers.get('Accept-Ranges'), 'bytes');
  assert.deepEqual(new Uint8Array(await fullRes.arrayBuffer()), bytes);

  const rangeRes = await onMediaRequest({
    request: new Request(uploaded.url, { headers: { Range: 'bytes=2-5' } }),
    env,
  });
  assert.equal(rangeRes.status, 206);
  assert.equal(rangeRes.headers.get('Content-Range'), 'bytes 2-5/8');
  assert.equal(rangeRes.headers.get('Content-Length'), '4');
  assert.deepEqual(new Uint8Array(await rangeRes.arrayBuffer()), new Uint8Array([30, 40, 50, 60]));

  const badRange = await onMediaRequest({
    request: new Request(uploaded.url, { headers: { Range: 'bytes=50-60' } }),
    env,
  });
  assert.equal(badRange.status, 416);
  assert.equal(badRange.headers.get('Content-Range'), 'bytes */8');

  const etag = fullRes.headers.get('ETag');
  const headRes = await onMediaRequest({
    request: new Request(uploaded.url, { method: 'HEAD', headers: { 'If-None-Match': etag } }),
    env,
  });
  assert.equal(headRes.status, 304);

  // Deleting via the returned URL works on the same Pages project.
  const delReq = new Request('https://modelportfolio.pages.dev/api/models/sushmita-ghosh/media', {
    method: 'DELETE',
    headers: {
      Origin: 'https://modelportfolio.pages.dev',
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: uploaded.url }),
  });
  const delRes = await onApiRequest({ request: delReq, env });
  assert.equal(delRes.status, 204);
  assert.equal(env.MEDIA.objects.size, 0);
});

test('admin API validates email-style text boxes, richText runs, and live /:slug/ renders them immediately', async () => {
  const env = fakeEnv({ ADMIN_ORIGIN: '' });

  // Unsupported font family, colour, or richText run is rejected with 400.
  const badFont = await handleRequest(
    apiRequest('PUT', '/api/models/jane-doe', {
      origin: 'https://admin.example.test',
      body: { model: validModel({ fonts: { name: { family: 'unknown-font' } } }) },
    }),
    env,
  );
  assert.equal(badFont.status, 400);

  const badColor = await handleRequest(
    apiRequest('PUT', '/api/models/jane-doe', {
      origin: 'https://admin.example.test',
      body: { model: validModel({ fonts: { bio: { color: 'javascript:alert(1)' } } }) },
    }),
    env,
  );
  assert.equal(badColor.status, 400);

  const badRun = await handleRequest(
    apiRequest('PUT', '/api/models/jane-doe', {
      origin: 'https://admin.example.test',
      body: { model: validModel({ richText: { contactHeading: [{ text: 'Hi', size: '999px' }] } }) },
    }),
    env,
  );
  assert.equal(badRun.status, 400);

  // Valid texts + inline richText + box fonts save to R2 and render live on /:slug/.
  const modelWithRichText = validModel({
    bio: ['Editorial & runway model.'],
    texts: {
      contactLabel: 'Direct bookings',
      contactHeading: 'Work with Jane Doe.',
    },
    fonts: {
      name: { family: 'pinyon-script', style: 'normal', weight: '400', size: 'lg' },
      bio: { family: 'eb-garamond', style: 'normal', weight: '400', align: 'center' },
    },
    richText: {
      contactHeading: [
        { text: 'Work with ' },
        { text: 'Jane Doe.', bold: true, italic: true, family: 'playfair-display', color: '#c9a77d' },
      ],
      bio: [
        [
          { text: 'Editorial', underline: true, bold: true },
          { text: ' & runway model.' },
        ],
      ],
    },
  });
  const okSave = await handleRequest(
    apiRequest('PUT', '/api/models/jane-doe', {
      origin: 'https://admin.example.test',
      body: { model: modelWithRichText },
    }),
    env,
  );
  assert.equal(okSave.status, 200);

  const liveRes = await onSlugPageRequest({
    request: new Request('https://modelportfolio.pages.dev/jane-doe/'),
    env,
    params: { slug: 'jane-doe' },
    next: async () => new Response('unused'),
  });
  assert.equal(liveRes.status, 200);
  const html = await liveRes.text();
  assert.match(html, /family=Pinyon\+Script/);
  assert.match(html, /family=EB\+Garamond/);
  assert.match(html, /family=Playfair\+Display/);
  assert.match(html, /--font-name-family: &#39;Pinyon Script&#39;/);
  assert.match(html, /--font-name-scale: 1\.18/);
  assert.match(html, /--font-bio-align: center/);
  assert.match(html, /Direct bookings/);
  assert.match(html, /Work with <span style="font-family:&#39;Playfair Display&#39;, Georgia, serif;color:#c9a77d"><em><strong>Jane Doe\.<\/strong><\/em><\/span>/);
  assert.match(html, /<span style="text-decoration:underline"><strong>Editorial<\/strong><\/span> &amp; runway model\./);
});

// Tests for the admin Worker. GitHub and R2 are replaced with small fakes, so nothing
// leaves the machine and no real secrets are needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  base64ToUtf8,
  checkUpload,
  constantTimeEqual,
  keyFromPublicUrl,
  mediaKeyFor,
  utf8ToBase64,
  validateModelShape,
} from '../worker/src/model.mjs';
import { handleRequest } from '../worker/src/index.mjs';

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
  return {
    objects,
    async put(key, value, options) {
      objects.set(key, { value, options });
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function fakeEnv(overrides = {}) {
  return {
    ADMIN_TOKEN: TOKEN,
    GITHUB_TOKEN: 'github-test-token',
    REPO: 'owner/site',
    BRANCH: 'main',
    R2_PUBLIC_BASE: BASE,
    ADMIN_ORIGIN: ORIGIN,
    MEDIA: fakeBucket(),
    ...overrides,
  };
}

// A fake GitHub Contents API. `handler(url, init)` returns a Response.
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
  const res = await handleRequest(apiRequest('GET', '/api/models'), fakeEnv({ GITHUB_TOKEN: '' }));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /not configured/);
});

test('listing models returns the profile folders, without templates or hidden folders', async () => {
  const gh = fakeGithub(() =>
    json([
      { name: 'jane-doe', type: 'dir' },
      { name: '_template', type: 'dir' },
      { name: '.cache', type: 'dir' },
      { name: 'README.md', type: 'file' },
      { name: 'sushmita-ghosh', type: 'dir' },
    ]),
  );
  const res = await handleRequest(apiRequest('GET', '/api/models'), fakeEnv(), { fetch: gh.fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).models, ['jane-doe', 'sushmita-ghosh']);
  assert.match(gh.calls[0].url, /repos\/owner\/site\/contents\/models\?ref=main/);
});

test('reading a profile decodes model.json and returns its version', async () => {
  const model = validModel();
  const gh = fakeGithub(() => json({ sha: 'sha-1', content: utf8ToBase64(JSON.stringify(model)) }));
  const res = await handleRequest(apiRequest('GET', '/api/models/jane-doe'), fakeEnv(), { fetch: gh.fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.sha, 'sha-1');
  assert.deepEqual(body.model, model);
});

test('a profile that does not exist returns 404', async () => {
  const gh = fakeGithub(() => json({ message: 'Not Found' }, 404));
  const res = await handleRequest(apiRequest('GET', '/api/models/jane-doe'), fakeEnv(), { fetch: gh.fetchImpl });
  assert.equal(res.status, 404);
});

test('saving an invalid profile is refused before anything is committed', async () => {
  const gh = fakeGithub(() => json({}));
  const res = await handleRequest(
    apiRequest('PUT', '/api/models/jane-doe', { body: { sha: 'sha-1', model: validModel({ cover: undefined }) } }),
    fakeEnv(),
    { fetch: gh.fetchImpl },
  );
  assert.equal(res.status, 400);
  assert.equal(gh.calls.length, 0);
});

test('saving a valid profile commits model.json with the version it was read from', async () => {
  const gh = fakeGithub((url, init) => {
    if (init.method === 'PUT') return json({ content: { sha: 'sha-2' } });
    return json({});
  });
  const model = validModel({ name: 'Jane Q. Doe' });
  const res = await handleRequest(
    apiRequest('PUT', '/api/models/jane-doe', { body: { sha: 'sha-1', model } }),
    fakeEnv(),
    { fetch: gh.fetchImpl },
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).sha, 'sha-2');
  const put = gh.calls[0];
  assert.equal(put.method, 'PUT');
  assert.match(put.url, /contents\/models\/jane-doe\/model\.json$/);
  assert.equal(put.body.sha, 'sha-1');
  assert.equal(put.body.branch, 'main');
  assert.equal(put.body.message, 'Update jane-doe profile');
  assert.equal(JSON.parse(base64ToUtf8(put.body.content)).name, 'Jane Q. Doe');
});

test('a new profile is created without a version and reports a clash with an existing folder', async () => {
  const created = fakeGithub(() => json({ content: { sha: 'sha-new' } }));
  const ok = await handleRequest(
    apiRequest('PUT', '/api/models/new-person', { body: { model: validModel({ slug: 'new-person' }) } }),
    fakeEnv(),
    { fetch: created.fetchImpl },
  );
  assert.equal(ok.status, 200);
  assert.equal(created.calls[0].body.sha, undefined);
  assert.equal(created.calls[0].body.message, 'Add new-person profile');

  const clash = fakeGithub(() => json({ message: 'sha wasn\'t supplied' }, 422));
  const conflict = await handleRequest(
    apiRequest('PUT', '/api/models/new-person', { body: { model: validModel({ slug: 'new-person' }) } }),
    fakeEnv(),
    { fetch: clash.fetchImpl },
  );
  assert.equal(conflict.status, 409);
});

test('a stale version is reported as a conflict, not overwritten', async () => {
  const gh = fakeGithub(() => json({ message: 'is at a different sha' }, 409));
  const res = await handleRequest(
    apiRequest('PUT', '/api/models/jane-doe', { body: { sha: 'old', model: validModel() } }),
    fakeEnv(),
    { fetch: gh.fetchImpl },
  );
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /changed since you opened it/);
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

test('an invalid profile address is rejected before any GitHub call', async () => {
  const gh = fakeGithub(() => json({}));
  const res = await handleRequest(apiRequest('GET', '/api/models/Bad_Name'), fakeEnv(), { fetch: gh.fetchImpl });
  assert.equal(res.status, 400);
  assert.equal(gh.calls.length, 0);
});

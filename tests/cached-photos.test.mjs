import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('  var cachedOriginalChecks;'), source.indexOf('  function loadFullImageAfterThumbnail('));
function harness(candidates = [], hit = true) {
  const attrs = new Map([['src', 'preview.webp'], ['data-medium-src', 'thumb.webp'], ['data-full-src', '/full.jpg']]);
  const requests = [];
  const image = { tagName: 'IMG', getAttribute: k => attrs.get(k), removeAttribute: k => attrs.delete(k) };
  const context = vm.createContext({
    document: { querySelectorAll: () => candidates },
    window: { URL, location: { href: 'https://example.test/profile', origin: 'https://example.test' },
      fetch: async (url, options) => { requests.push({ url, options }); return { ok: hit, headers: new Map([['Content-Type', 'image/jpeg']]) }; } },
    setMediaSrc: (_, url) => attrs.set('src', url), finishPortfolioUpgrade() {}
  });
  vm.runInContext(helper, context);
  return { context, image, attrs, requests };
}
test('already displayed originals skip both lower-resolution stages immediately', () => {
  const h = harness([{ complete: true, naturalWidth: 1000, getAttribute: () => '/full.jpg' }]);
  assert.equal(h.context.useAvailableOriginal(h.image), true);
  assert.equal(h.attrs.get('src'), '/full.jpg');
  assert.equal(h.attrs.has('data-medium-src'), false);
  assert.equal(h.attrs.has('data-full-src'), false);
  assert.equal(h.requests.length, 0);
});
test('cached original skips progressive stages without a network download', async () => {
  const h = harness();
  h.context.useAvailableOriginal(h.image);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.attrs.get('src'), '/full.jpg');
  assert.equal(h.requests[0].options.cache, 'only-if-cached');
  assert.equal(h.requests[0].options.mode, 'same-origin');
});
test('cache miss retains preview and thumbnail loading', async () => {
  const h = harness([], false);
  h.context.useAvailableOriginal(h.image);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.attrs.get('src'), 'preview.webp');
  assert.equal(h.attrs.get('data-medium-src'), 'thumb.webp');
});

test('uncached photos download originals directly and display them without a thumbnail stage', async () => {
  const attrs = new Map([['src', 'preview.webp'], ['data-medium-src', 'thumb.webp'], ['data-full-src', '/full.jpg']]);
  const downloads = [];
  let loader;
  let finished = 0;
  const image = { tagName: 'IMG', closest: () => null, getAttribute: key => attrs.get(key), removeAttribute: key => attrs.delete(key) };
  const context = vm.createContext({
    useAvailableOriginal: () => false,
    finishPortfolioUpgrade: () => { finished++; },
    getMediaSrc: () => attrs.get('src'),
    setMediaSrc: (_, url) => attrs.set('src', url),
    window: { Image: class {
      constructor() { loader = this; }
      set src(url) { downloads.push(url); }
      decode() { return Promise.resolve(); }
    } }
  });
  const start = source.indexOf('  function loadFullImageAfterThumbnail(');
  vm.runInContext(source.slice(start, source.indexOf('  function advanceImageSourceAfterFailure', start)), context);
  context.loadFullImageAfterThumbnail(image);
  assert.deepEqual(downloads, ['/full.jpg']);
  assert.equal(attrs.get('src'), 'preview.webp');
  loader.onload();
  await Promise.resolve();
  assert.equal(attrs.get('src'), '/full.jpg');
  assert.equal(attrs.has('data-medium-src'), false);
  assert.equal(attrs.has('data-full-src'), false);
  assert.equal(finished, 1);
});

test('early carousel startup initializes cache checks before their declaration executes', async () => {
  const attrs = new Map([['data-full-src', '/full.jpg']]);
  let requests = 0;
  const image = { tagName: 'IMG', getAttribute: key => attrs.get(key), removeAttribute: key => attrs.delete(key) };
  const context = vm.createContext({
    image,
    document: { querySelectorAll: () => [] },
    window: { URL, location: { href: 'https://example.test/profile', origin: 'https://example.test' },
      fetch: async () => { requests++; return { ok: true, headers: new Map([['Content-Type', 'image/jpeg']]) }; } },
    setMediaSrc: (_, url) => attrs.set('src', url), finishPortfolioUpgrade() {}
  });
  // Function declarations are hoisted, but variable initializers have not run
  // when hero.reset() invokes onChange near the start of site.js.
  assert.doesNotThrow(() => vm.runInContext('useAvailableOriginal(image);\n' + helper, context));
  context.useAvailableOriginal(image);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1, 'later declaration must not reset the early cache map');
  assert.equal(attrs.get('src'), '/full.jpg');
});

// First-screen loading rules found with Lighthouse (mobile, simulated Slow 4G):
// the full-viewport hero photo is ignored as an LCP candidate, so the header
// text is measured, and anything requested before it paints delays it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

import { renderModelPage } from '../scripts/lib/render.mjs';
import { googleFontsHrefFor } from '../scripts/lib/fonts.mjs';
import { handleModelPageRequest } from '../worker/src/index.mjs';

const siteJs = await fs.readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const siteCss = await fs.readFile(new URL('../site/assets/site.css', import.meta.url), 'utf8');

const ctx = { base: '/', year: 2026, mediaUrl: (f) => `/media/m/${f}`, sizeOf: () => ({ width: 1200, height: 1800 }) };
const baseModel = {
  slug: 'm', name: 'Jane Doe', bio: ['Bio.'],
  cover: [{ file: 'one.jpg', alt: 'One' }, { file: 'two.jpg', alt: 'Two' }, { file: 'three.jpg', alt: 'Three' }],
  photos: [], videos: [], contact: { email: 'jane@example.com' },
};

// ---- Fonts and <head> ------------------------------------------------------

test('default profiles make no Google Fonts request: Inter is self-hosted', () => {
  assert.equal(googleFontsHrefFor(), '');
  assert.equal(googleFontsHrefFor({ bio: { family: 'inter', style: 'italic', weight: '300' } }), '');
  assert.equal(googleFontsHrefFor(undefined, { bio: [[{ text: 'Hi', italic: true }]] }), '', 'italic Inter runs are self-hosted too');

  const html = renderModelPage(baseModel, ctx);
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.equal((html.match(/rel="stylesheet"/g) ?? []).length, 1, 'site.css is the only stylesheet');
  assert.ok(html.indexOf('<script>') < html.indexOf('rel="stylesheet"'),
    'the inline head script runs before any stylesheet, so it never waits for one');
});

test('fonts that are not self-hosted load from Google without blocking the first paint', () => {
  const href = googleFontsHrefFor({ name: { family: 'playfair-display', style: 'normal', weight: '400' } });
  assert.match(href, /^https:\/\/fonts\.googleapis\.com\/css2\?family=Playfair/);
  assert.doesNotMatch(href, /family=Inter/, 'Inter is never requested from Google');

  const html = renderModelPage({ ...baseModel, fonts: { name: { family: 'playfair-display', style: 'normal', weight: '400' } } }, ctx);
  const escaped = href.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(html, new RegExp(`<link rel="stylesheet" href="${escaped}" media="print" onload="this\\.media='all'">`));
  assert.match(html, new RegExp(`<noscript><link rel="stylesheet" href="${escaped}"></noscript>`));
});

test('every font file referenced by the stylesheet exists', async () => {
  const urls = [...siteCss.matchAll(/url\('(fonts\/[^']+)'\)/g)].map((m) => m[1]);
  assert.ok(urls.some((u) => u.includes('inter-latin-wght-normal')), 'Inter is declared with @font-face');
  for (const url of urls) await fs.access(new URL(`../site/assets/${url}`, import.meta.url));
  await fs.access(new URL('../site/assets/fonts/LICENSE-inter.txt', import.meta.url));
});

// ---- Hero slideshow ----------------------------------------------------------

function fakeElement(tagName, attrs = {}) {
  const map = new Map(Object.entries(attrs));
  const writes = [];
  return {
    tagName, writes, children: [],
    getAttribute: (k) => (map.has(k) ? map.get(k) : null),
    setAttribute: (k, v) => { map.set(k, String(v)); writes.push(k); },
    removeAttribute: (k) => { map.delete(k); },
    querySelectorAll(selector) { return this.children.filter((c) => c.tagName.toLowerCase() === selector); },
    attrs: map,
  };
}

function heroSlide(name, deferred) {
  const picture = fakeElement('PICTURE');
  const key = deferred ? 'data-deferred-' : '';
  const source = fakeElement('SOURCE', { type: 'image/avif', [`${key}srcset`]: `${name}-960.avif 960w` });
  const img = fakeElement('IMG', { [`${key}src`]: `${name}-2400.webp`, [`${key}srcset`]: `${name}-960.webp 960w`, loading: deferred ? 'lazy' : 'eager' });
  picture.children.push(source, img);
  img.parentElement = picture;
  return { picture, source, img };
}

function heroHarness(current = 0) {
  const slides = [heroSlide('one', false), heroSlide('two', true), heroSlide('three', true)];
  const order = [];
  slides.forEach((s, i) => {
    const set = s.img.setAttribute;
    s.img.setAttribute = (k, v) => { if (k === 'src') order.push(i); set(k, v); };
  });
  const code = siteJs.slice(siteJs.indexOf('  function activateDeferredImage('), siteJs.indexOf('  if (heroRoot) {'));
  const context = vm.createContext({
    heroRoot: { querySelectorAll: (sel) => (sel === 'img' ? slides.map((s) => s.img) : []) },
    hero: { current: () => current },
  });
  vm.runInContext(code, context);
  return { context, slides, order };
}

test('later cover photos stay unrequested until released, then load in slideshow order', () => {
  const h = heroHarness(0);
  assert.equal(h.slides[1].img.getAttribute('src'), null, 'nothing is requested before release');

  h.context.releaseHeroSlides();
  assert.deepEqual(h.order, [1, 2], 'the next slide is the next download; the first slide is untouched');
  for (const { img, source } of h.slides.slice(1)) {
    assert.match(img.getAttribute('src'), /-2400\.webp$/);
    assert.match(img.getAttribute('srcset'), /-960\.webp 960w$/);
    assert.match(source.getAttribute('srcset'), /-960\.avif 960w$/);
    assert.equal(img.getAttribute('loading'), 'eager', 'off-screen slides must not wait for lazy loading');
    assert.equal(img.getAttribute('data-deferred-src'), null);
    assert.equal(img.getAttribute('data-deferred-srcset'), null);
    assert.equal(source.getAttribute('data-deferred-srcset'), null);
    assert.ok(img.writes.indexOf('srcset') < img.writes.indexOf('src'), 'srcset is in place before src starts a request');
  }
  assert.deepEqual(h.slides[0].img.writes, [], 'the already-loading first slide is left alone');

  h.context.releaseHeroSlides();
  assert.deepEqual(h.order, [1, 2], 'releasing twice requests nothing again');
});

test('a slide reached by swipe, dot or autoplay is requested first', () => {
  const h = heroHarness(2);
  h.context.releaseHeroSlides(2);
  assert.deepEqual(h.order, [2, 1]);
});

test('site.js releases the deferred slides after load, on first touch, or when the slideshow moves', () => {
  const heroBlock = siteJs.slice(siteJs.indexOf('  if (heroRoot) {'), siteJs.indexOf('  // Keep the cover slides aligned'));
  assert.match(heroBlock, /img\.fetchPriority = i === 0 \? 'high' : 'low';/);
  assert.match(heroBlock, /if \(i !== 0 \|\| heroSlidesReleased\) releaseHeroSlides\(i\);/,
    'startup (slide 0) releases nothing; any later slide change does');
  assert.match(heroBlock, /window\.addEventListener\('load', releaseWhenIdle\)/);
  assert.match(heroBlock, /\['pointerdown', 'touchstart', 'focusin'\]/);
  assert.match(heroBlock, /setTimeout\(function \(\) \{ releaseHeroSlides\(\); \}, 3500\)/, 'fail-safe if load is slow');
  assert.ok(siteJs.indexOf('var heroSlidesReleased = false;') < siteJs.indexOf('hero.reset(0);'),
    'the flag is initialised before reset() calls onChange');
  assert.match(siteCss, /html:not\(\.js\) \.hero-carousel \.carousel-slide:first-child \{\s*z-index: 1;/,
    'before site.js runs, the loading first photo is the one on top');
});

// ---- Page loader ------------------------------------------------------------

function loaderHarness({ complete = false } = {}) {
  const timers = [];
  const windowListeners = {};
  const coverListeners = {};
  const loader = { classList: new Set(), setAttribute() {}, style: {}, parentNode: {} };
  loader.classList.add = loader.classList.add.bind(loader.classList);
  const cover = {
    complete,
    getAttribute: (k) => (k === 'src' ? 'one.avif' : null),
    addEventListener: (type, fn) => { coverListeners[type] = fn; },
    decode: () => Promise.resolve(),
  };
  const code = siteJs.slice(siteJs.indexOf('  // ---- Beautiful page loader'), siteJs.indexOf('  // ---- Always open / refresh'));
  vm.runInContext(code, vm.createContext({
    Date: { now: () => 1000 },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    document: {
      readyState: 'interactive',
      getElementById: (id) => (id === 'page-loader' ? loader : null),
      querySelector: (sel) => (sel === '.hero-carousel .carousel-slide img' ? cover : null),
    },
    window: { addEventListener: (type, fn) => { windowListeners[type] = fn; } },
  }));
  const flush = async () => {
    await new Promise((r) => setImmediate(r));
    for (let i = 0; i < 4; i++) timers.splice(0).filter((t) => t.ms <= 520).forEach((t) => t.fn());
  };
  return { loader, coverListeners, windowListeners, flush };
}

test('the page loader reveals the page once the first cover photo is ready, not after every image', async () => {
  const h = loaderHarness();
  await h.flush();
  assert.equal(h.loader.classList.has('is-hidden'), false, 'still covering while the cover photo loads');
  h.coverListeners.load();
  await h.flush();
  assert.equal(h.loader.classList.has('is-hidden'), true, 'hidden without waiting for window load');
  assert.equal(typeof h.windowListeners.load, 'function', 'window load remains a fallback');

  const ready = loaderHarness({ complete: true });
  await ready.flush();
  assert.equal(ready.loader.classList.has('is-hidden'), true, 'an already-loaded cover reveals at once');
});

// ---- Live page server --------------------------------------------------------

test('a live page starts its profile, state and seed reads together', async () => {
  const started = [];
  let open;
  const gate = new Promise((r) => { open = r; });
  const model = { ...baseModel, cover: [{ file: 'https://media.test/m/one.jpg', alt: 'One' }] };
  const objects = new Map([['_profiles/m.json', JSON.stringify(model)]]);
  const env = {
    MEDIA: {
      async get(key) {
        started.push(key);
        await gate;
        const text = objects.get(key);
        return text === undefined ? null : { httpEtag: '"v1"', text: async () => text, body: text };
      },
      async head() { return null; },
    },
    ASSETS: {
      async fetch(request) {
        started.push(new URL(request.url).pathname);
        await gate;
        return new Response(JSON.stringify({ sizes: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    },
  };
  const pending = handleModelPageRequest({
    request: new Request('https://site.test/m/'), env, params: { slug: 'm' }, next: () => new Response('static'),
  });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.deepEqual(started.sort(), ['/_seed/m.json', '_profile-state/m.json', '_profiles/m.json'],
    'all three reads are in flight before any of them returns');
  open();
  const res = await pending;
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Jane Doe/);
});

test('an archived page still returns 404 when the early profile read fails', async () => {
  const rejections = [];
  const onRejection = (err) => rejections.push(err);
  process.on('unhandledRejection', onRejection);
  try {
    const env = {
      MEDIA: {
        async get(key) {
          if (key === '_profile-state/m.json') return { text: async () => JSON.stringify({ state: 'archived' }) };
          throw new Error('R2 unavailable');
        },
      },
    };
    const res = await handleModelPageRequest({
      request: new Request('https://site.test/m/'), env, params: { slug: 'm' }, next: () => new Response('static'),
    });
    assert.equal(res.status, 404);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(rejections, [], 'the unused early read never becomes an unhandled rejection');
  } finally {
    process.off('unhandledRejection', onRejection);
  }
});

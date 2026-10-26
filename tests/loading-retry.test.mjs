import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { build } from '../scripts/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteJsPath = path.join(root, 'site', 'assets', 'site.js');
const siteDir = path.join(root, 'site');

async function createTempWorkspace(model) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'load-retry-test-'));
  const modelsDir = path.join(tmp, 'models');
  const modelDir = path.join(modelsDir, model.slug);
  await fs.mkdir(path.join(modelDir, 'media'), { recursive: true });
  await fs.writeFile(path.join(modelDir, 'model.json'), JSON.stringify(model, null, 2));
  return {
    tmp,
    modelsDir,
    outDir: path.join(tmp, 'dist'),
    async cleanup() {
      await fs.rm(tmp, { recursive: true, force: true });
    },
  };
}

test('website loading speed: preloads LCP cover image, preconnects origins, and sets eager/lazy/on-demand loading attributes', async () => {
  const R2 = 'https://media.example.test';
  const model = {
    slug: 'speed-test',
    name: 'Speed Test',
    cover: [
      { file: `${R2}/speed-test/hero-1.jpg`, alt: 'Hero 1', width: 1200, height: 1600 },
      { file: `${R2}/speed-test/hero-2.jpg`, alt: 'Hero 2', width: 1200, height: 1600 },
    ],
    photos: [
      { file: `${R2}/speed-test/photo-1.jpg`, title: 'Photo 1', category: 'Editorial', width: 900, height: 1200 },
      { file: `${R2}/speed-test/photo-2.jpg`, title: 'Photo 2', category: 'Editorial', width: 900, height: 1200 },
    ],
    videos: [
      {
        file: `${R2}/speed-test/video-1.mp4`,
        title: 'Video 1',
        category: 'Motion',
        poster: `${R2}/speed-test/poster-1.jpg`,
      },
    ],
    contact: { email: 'speed@example.com' },
  };

  const ws = await createTempWorkspace(model);
  try {
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir, year: 2026, basePath: '/' });
    const html = await fs.readFile(path.join(ws.outDir, 'speed-test', 'index.html'), 'utf8');

    // 1. Only the LCP cover is preloaded; preloading every full-size cover delays first paint.
    assert.match(html, /<link rel="preload" as="image" href="https:\/\/media\.example\.test\/speed-test\/hero-1\.jpg" fetchpriority="high">/);
    assert.ok(html.indexOf('<link rel="preload" as="image"') < html.indexOf('<title>'), 'first hero image is requested before page metadata');
    assert.doesNotMatch(html, /<link rel="preload" as="image" href="https:\/\/media\.example\.test\/speed-test\/hero-2\.jpg">/);

    // 2. <head> optimizations: Preconnect and dns-prefetch to remote media CDN origin
    assert.match(html, /<link rel="preconnect" href="https:\/\/media\.example\.test" crossorigin>/);
    assert.match(html, /<link rel="dns-prefetch" href="https:\/\/media\.example\.test">/);

    // 3. <head> optimizations: dns-prefetch for Google Fonts
    assert.match(html, /<link rel="dns-prefetch" href="https:\/\/fonts\.googleapis\.com">/);
    assert.match(html, /<link rel="dns-prefetch" href="https:\/\/fonts\.gstatic\.com">/);

    // 4. All hero slides load eagerly.
    assert.match(html, /<img class="hero-media" src="https:\/\/media\.example\.test\/speed-test\/hero-1\.jpg" alt="Hero 1"[^>]*loading="eager" fetchpriority="high" decoding="async"/);
    assert.match(html, /<img class="hero-media" src="https:\/\/media\.example\.test\/speed-test\/hero-2.jpg" alt="Hero 2"[^>]*loading="eager" fetchpriority="high" decoding="async"/);

    // 5. Portfolio gallery photos: loading="lazy" decoding="async"
    assert.match(html, /<img src="https:\/\/media\.example\.test\/speed-test\/photo-1\.jpg" alt="Photo 1"[^>]*loading="lazy" decoding="async"/);
    assert.match(html, /<img src="https:\/\/media\.example\.test\/speed-test\/photo-2\.jpg" alt="Photo 2"[^>]*loading="lazy" decoding="async"/);

    // 6. Videos have no active source and no native controls until the poster is
    //    played, and nothing is drawn over the poster: no play button, no glyph.
    const videos = html.match(/<video\b[^>]*>/g) || [];
    assert.ok(videos.length);
    videos.forEach(tag => {
      assert.match(tag, /\spreload="none"/);
      assert.doesNotMatch(tag, /\ssrc=/);
      assert.doesNotMatch(tag, /\scontrols[\s=>]/, `idle video must not carry native controls: ${tag}`);
      assert.match(tag, /data-video-src=/);
    });
    assert.doesNotMatch(html, /video-play-button/, 'video cards render no play button');
    assert.doesNotMatch(html, /▶/, 'video cards render no play glyph');
  } finally {
    await ws.cleanup();
  }
});

// Mock DOM harness for testing media retry in site.js
function createRetryHarness() {
  let clock = 10_000;
  const timers = new Map();
  let nextTimerId = 1;

  class ClassList {
    constructor(initial = []) {
      this._set = new Set(initial.filter(Boolean));
    }
    add(...names) { names.forEach((n) => this._set.add(n)); }
    remove(...names) { names.forEach((n) => this._set.delete(n)); }
    contains(name) { return this._set.has(name); }
    toggle(name, force) {
      if (force === undefined) {
        if (this._set.has(name)) { this._set.delete(name); return false; }
        this._set.add(name); return true;
      }
      if (force) this._set.add(name);
      else this._set.delete(name);
      return Boolean(force);
    }
    toArray() { return [...this._set]; }
  }

  class ElementNode {
    constructor(tagName, { id = '', className = '', attrs = {} } = {}) {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.classList = new ClassList(className.split(/\s+/));
      this.attributes = new Map(Object.entries(attrs));
      this.children = [];
      this.parentElement = null;
      this.listeners = new Map();
      this.style = {};
      this.hidden = false;
      this.open = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.complete = false;
      this.readyState = 0;
      this.loadCalls = 0;
    }

    get src() {
      return this.attributes.get('src') || '';
    }
    set src(v) {
      this.attributes.set('src', String(v));
    }

    get poster() {
      return this.attributes.get('poster') || '';
    }
    set poster(v) {
      this.attributes.set('poster', String(v));
    }

    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    removeAttribute(k) { this.attributes.delete(k); }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    closest(selector) {
      let cur = this;
      while (cur) {
        if (selector.startsWith('.') && cur.classList.contains(selector.slice(1))) return cur;
        if (selector.startsWith('#') && cur.id === selector.slice(1)) return cur;
        if (cur.tagName.toLowerCase() === selector.toLowerCase()) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    querySelectorAll(selector) {
      const results = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (selector === 'img' && child.tagName === 'IMG') results.push(child);
          else if (selector === 'video' && child.tagName === 'VIDEO') results.push(child);
          else if (selector === 'img, video' && (child.tagName === 'IMG' || child.tagName === 'VIDEO')) results.push(child);
          else if (selector === '.carousel-slide' && child.classList.contains('carousel-slide')) results.push(child);
          else if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) results.push(child);
          visit(child);
        }
      };
      visit(this);
      return results;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }

    dispatchEvent(event) {
      event.target = event.target ?? this;
      let cur = this;
      while (cur) {
        event.currentTarget = cur;
        const list = cur.listeners.get(event.type) ?? [];
        for (const fn of [...list]) fn.call(cur, event);
        if (event._stopped) break;
        cur = event.bubbles === false ? null : cur.parentElement;
      }
      return !event.defaultPrevented;
    }

    load() {
      this.loadCalls++;
    }
  }

  function makeEvent(type, props = {}) {
    return {
      type,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      _stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this._stopped = true; },
      ...props,
    };
  }

  const documentRoot = new ElementNode('html');
  const body = documentRoot.appendChild(new ElementNode('body', { className: 'model-page' }));

  // Create test img and video elements
  const testImg = body.appendChild(new ElementNode('img', {
    attrs: { src: 'https://media.example.com/test-photo.jpg' },
  }));
  testImg.src = 'https://media.example.com/test-photo.jpg';

  const testVideo = body.appendChild(new ElementNode('video', {
    attrs: {
      src: 'https://media.example.com/test-video.mp4#t=0.1',
      poster: 'https://media.example.com/test-poster.jpg',
    },
  }));
  testVideo.src = 'https://media.example.com/test-video.mp4#t=0.1';
  testVideo.poster = 'https://media.example.com/test-poster.jpg';

  const dialog = body.appendChild(new ElementNode('dialog', { id: 'lightbox', className: 'lightbox' }));
  dialog.showModal = function () { this.open = true; };
  dialog.close = function () {
    this.open = false;
    this.dispatchEvent(makeEvent('close', { bubbles: false }));
  };
  const lbInner = dialog.appendChild(new ElementNode('div', { className: 'lb-inner' }));
  const closeBtn = lbInner.appendChild(new ElementNode('button', { className: 'lb-btn lb-close' }));
  const stage = lbInner.appendChild(new ElementNode('div', { id: 'lb-stage', className: 'carousel lb-stage' }));

  const windowListeners = new Map();
  const navigatorObj = { onLine: true };

  const windowObj = {
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    dispatchEvent(ev) {
      for (const fn of windowListeners.get(ev.type) ?? []) fn(ev);
    },
    requestAnimationFrame(cb) { cb(); return 1; },
    cancelAnimationFrame() {},
    setTimeout(fn, ms) {
      const id = nextTimerId++;
      timers.set(id, { fn, due: clock + (ms || 0) });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval() { return nextTimerId++; },
    clearInterval() {},
    navigator: navigatorObj,
    location: { pathname: '/speed-test/', search: '', hash: '' },
    history: { scrollRestoration: 'manual', replaceState() {} },
    scrollTo() {},
  };

  const documentListeners = new Map();
  const documentObj = {
    documentElement: documentRoot,
    body,
    visibilityState: 'visible',
    addEventListener(type, fn) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(fn);
    },
    dispatchEvent(ev) {
      for (const fn of documentListeners.get(ev.type) ?? []) fn(ev);
    },
    getElementById(id) { return documentRoot.querySelector(`#${id}`); },
    querySelector(sel) { return documentRoot.querySelector(sel); },
    querySelectorAll(sel) { return documentRoot.querySelectorAll(sel); },
    createElement(tag) { return new ElementNode(tag); },
  };

  const FakeDate = function (...args) { return new Date(...args); };
  FakeDate.now = () => clock;

  return {
    testImg,
    testVideo,
    dialog,
    stage,
    windowObj,
    documentObj,
    navigatorObj,
    makeEvent,
    advanceTime(ms) {
      clock += ms;
      for (const [id, entry] of [...timers.entries()]) {
        if (entry.due <= clock) {
          timers.delete(id);
          entry.fn();
        }
      }
    },
    async boot() {
      const code = await fs.readFile(siteJsPath, 'utf8');
      const ctx = vm.createContext({
        window: windowObj,
        document: documentObj,
        navigator: navigatorObj,
        history: windowObj.history,
        location: windowObj.location,
        Date: FakeDate,
        Math,
        setTimeout: windowObj.setTimeout,
        clearTimeout: windowObj.clearTimeout,
        setInterval: windowObj.setInterval,
        clearInterval: windowObj.clearInterval,
        requestAnimationFrame: windowObj.requestAnimationFrame,
        cancelAnimationFrame: windowObj.cancelAnimationFrame,
      });
      vm.runInContext(code, ctx, { filename: 'site.js' });
    },
  };
}

test('automatic photo retry: retries loading on error with exponential backoff and cache-busting parameter', async () => {
  const h = createRetryHarness();
  await h.boot();

  const img = h.testImg;
  const initialSrc = img.src;
  assert.equal(initialSrc, 'https://media.example.com/test-photo.jpg');

  // Trigger error event on image
  img.dispatchEvent(h.makeEvent('error', { bubbles: false }));
  assert.equal(img.classList.contains('is-retrying'), true, 'enters retrying state');
  assert.equal(img.src, initialSrc, 'src not changed yet before timer elapses');

  // Advance time past first retry delay (~800ms)
  h.advanceTime(1000);
  assert.match(img.src, /https:\/\/media\.example\.com\/test-photo\.jpg\?_r=\d+_1/, 'appends retry cache-buster parameter');

  // Simulate second error
  img.dispatchEvent(h.makeEvent('error', { bubbles: false }));
  h.advanceTime(2000);
  assert.match(img.src, /https:\/\/media\.example\.com\/test-photo\.jpg\?_r=\d+_2/, 'increments retry attempt parameter');

  // Simulate successful load
  img.naturalWidth = 800;
  img.naturalHeight = 1000;
  img.complete = true;
  img.dispatchEvent(h.makeEvent('load', { bubbles: false }));

  assert.equal(img.classList.contains('is-retrying'), false, 'clears retrying state on success');
  assert.equal(img.classList.contains('is-failed'), false);
});

test('automatic video retry: updates video and poster URLs with backoff and calls video.load()', async () => {
  const h = createRetryHarness();
  await h.boot();

  const vid = h.testVideo;
  assert.equal(vid.loadCalls, 0);

  // Trigger video error
  vid.dispatchEvent(h.makeEvent('error', { bubbles: false }));
  assert.equal(vid.classList.contains('is-retrying'), true, 'video enters retrying state');

  // Advance time past first retry delay
  h.advanceTime(1000);
  assert.match(vid.src, /https:\/\/media\.example\.com\/test-video\.mp4\?_r=\d+_1#t=0\.1/, 'retry preserves #t=0.1 video hash');
  assert.match(vid.poster, /https:\/\/media\.example\.com\/test-poster\.jpg\?_r=\d+_1/, 'retries custom poster URL');
  assert.equal(vid.loadCalls, 1, 'calls video.load() to re-trigger network fetch');

  // Video readyState reaches 2 and fires loadeddata
  vid.readyState = 2;
  vid.dispatchEvent(h.makeEvent('loadeddata', { bubbles: false }));
  assert.equal(vid.classList.contains('is-retrying'), false, 'clears retrying state on loadeddata');
});

test('offline handling: pauses retrying while offline and retries immediately when back online', async () => {
  const h = createRetryHarness();
  await h.boot();

  const img = h.testImg;
  h.navigatorObj.onLine = false;

  // Error occurs while device is offline
  img.dispatchEvent(h.makeEvent('error', { bubbles: false }));
  assert.equal(img._waitingForOnline, true, 'marks waiting for online');

  // Advancing time should not fire retry while offline
  h.advanceTime(5000);
  assert.equal(img.src, 'https://media.example.com/test-photo.jpg');

  // Device comes back online
  h.navigatorObj.onLine = true;
  h.windowObj.dispatchEvent(h.makeEvent('online'));

  // Advancing time past the retry delay executes the retry
  h.advanceTime(1000);
  assert.match(img.src, /_r=\d+_1/, 'retries after coming back online');
});

test('max retries reached marks is-failed, and click triggers an immediate retry', async () => {
  const h = createRetryHarness();
  await h.boot();

  const img = h.testImg;

  // Cause 5 consecutive errors
  for (let i = 1; i <= 5; i++) {
    img.dispatchEvent(h.makeEvent('error', { bubbles: false }));
    h.advanceTime(15000);
  }

  // 6th error exceeds MAX_MEDIA_RETRIES (5)
  img.dispatchEvent(h.makeEvent('error', { bubbles: false }));
  assert.equal(img.classList.contains('is-failed'), true, 'marks is-failed when max retries exceeded');
  assert.equal(img.classList.contains('is-retrying'), false);

  // User taps/clicks on the failed image
  img.dispatchEvent(h.makeEvent('click'));
  assert.equal(img.classList.contains('is-retrying'), true, 'tapping failed image resets attempts and retries');
});

test('loading animation in frames: frames display loading state while media is loading and clear it when loaded', async () => {
  // Check CSS rules for the small loading animation spinner in frames
  const css = await fs.readFile(path.join(siteDir, 'assets', 'site.css'), 'utf8');
  assert.match(css, /@keyframes frame-spinner/, 'CSS defines frame-spinner animation');
  assert.match(css, /\.gallery-btn:not\(\.is-loaded\)::before/, 'CSS attaches spinner to loading gallery buttons');
  assert.match(css, /\.video-frame:not\(\.is-loaded\)::before/, 'CSS attaches spinner to loading video frames');
  assert.match(css, /\.carousel-slide\.is-loading::before/, 'CSS attaches spinner to loading carousel slides');
  assert.match(css, /animation:\s*frame-spinner/, 'spinner rotates via frame-spinner animation');

  const h = createRetryHarness();
  // Frame containers
  const galleryBtn = h.documentObj.body.appendChild(new (h.testImg.constructor)('button', { className: 'gallery-btn' }));
  const galleryImg = galleryBtn.appendChild(new (h.testImg.constructor)('img', { attrs: { src: 'https://media.example.com/gallery.jpg' } }));
  galleryImg.src = 'https://media.example.com/gallery.jpg';
  galleryImg.naturalWidth = 0;
  galleryImg.complete = false;

  const videoFrame = h.documentObj.body.appendChild(new (h.testVideo.constructor)('div', { className: 'video-frame' }));
  const frameVideo = videoFrame.appendChild(new (h.testVideo.constructor)('video', { attrs: { src: 'https://media.example.com/reel.mp4' } }));
  frameVideo.src = 'https://media.example.com/reel.mp4';
  frameVideo.readyState = 0;

  await h.boot();

  // Initially while photo and video are loading, frames are marked is-loading and not is-loaded
  assert.equal(galleryBtn.classList.contains('is-loading'), true, 'gallery frame has is-loading while image is loading');
  assert.equal(galleryBtn.classList.contains('is-loaded'), false);

  assert.equal(videoFrame.classList.contains('is-loading'), true, 'video frame has is-loading while video is loading');
  assert.equal(videoFrame.classList.contains('is-loaded'), false);

  // When photo finishes loading, frame transitions to is-loaded
  galleryImg.naturalWidth = 1200;
  galleryImg.naturalHeight = 1600;
  galleryImg.complete = true;
  galleryImg.dispatchEvent(h.makeEvent('load', { bubbles: false }));

  assert.equal(galleryBtn.classList.contains('is-loaded'), true, 'gallery frame has is-loaded once image loads');
  assert.equal(galleryBtn.classList.contains('is-loading'), false);

  // When video loads metadata/data, frame transitions to is-loaded
  frameVideo.readyState = 2;
  frameVideo.dispatchEvent(h.makeEvent('loadeddata', { bubbles: false }));

  assert.equal(videoFrame.classList.contains('is-loaded'), true, 'video frame has is-loaded once video data loads');
  assert.equal(videoFrame.classList.contains('is-loading'), false);

  // If photo fails and is retrying, frame keeps is-loading active
  galleryImg.naturalWidth = 0;
  galleryImg.complete = false;
  galleryImg.dispatchEvent(h.makeEvent('error', { bubbles: false }));
  assert.equal(galleryBtn.classList.contains('is-loading'), true, 'frame stays is-loading while retrying');
  assert.equal(galleryBtn.classList.contains('is-loaded'), false);
});

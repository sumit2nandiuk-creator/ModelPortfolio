import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteJsPath = path.join(root, 'site', 'assets', 'site.js');

// Minimal DOM harness tailored to site/assets/site.js so we can exercise mobile
// touch-zoom gestures (pinch, pan, double-tap, backdrop tap, 1-finger carousel swipe)
// without an external headless browser.
function createLightboxHarness({ width = 390, height = 844, naturalWidth = 1200, naturalHeight = 1600 } = {}) {
  let clock = 10_000;
  let rafId = 1;
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

  function matchesSelector(el, selector) {
    if (!el || !selector) return false;
    return selector.split(',').some((raw) => {
      const s = raw.trim();
      if (!s) return false;
      // Support compound selectors used in site.js: '#id', '.cls', 'tag', '.a .b'
      const parts = s.split(/\s+/);
      let cur = el;
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        const matchOne = (node) => {
          if (!node) return false;
          if (part.startsWith('#')) return node.id === part.slice(1);
          if (part.startsWith('.')) return node.classList.contains(part.slice(1));
          if (part.startsWith('[') && part.endsWith(']')) {
            const inner = part.slice(1, -1);
            const eq = inner.indexOf('=');
            if (eq === -1) return node.attributes.has(inner);
            const attrName = inner.slice(0, eq);
            const attrVal = inner.slice(eq + 1).replace(/^['"]|['"]$/g, '');
            return node.getAttribute(attrName) === attrVal;
          }
          return node.tagName.toLowerCase() === part.toLowerCase();
        };
        if (i === parts.length - 1) {
          if (!matchOne(cur)) return false;
        } else {
          cur = cur.parentElement;
          while (cur && !matchOne(cur)) cur = cur.parentElement;
          if (!cur) return false;
        }
      }
      return true;
    });
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
      this.style = { transition: '', transform: '' };
      this.hidden = false;
      this.open = false;
      this.draggable = true;
      this.decoding = 'auto';
      this.alt = '';
      this._textContent = '';
      this.clientWidth = width;
      this.clientHeight = height;
      this.naturalWidth = this.tagName === 'IMG' ? naturalWidth : 0;
      this.naturalHeight = this.tagName === 'IMG' ? naturalHeight : 0;
      this._rect = { left: 0, top: 0, width, height, right: width, bottom: height };
    }

    get className() { return this.classList.toArray().join(' '); }
    set className(v) { this.classList = new ClassList(String(v).split(/\s+/)); }

    get textContent() { return this._textContent; }
    set textContent(v) {
      this._textContent = String(v);
      if (v === '') {
        for (const c of this.children) c.parentElement = null;
        this.children = [];
      }
    }

    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    removeAttribute(k) { this.attributes.delete(k); }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    getBoundingClientRect() { return { ...this._rect }; }
    focus() {}
    setPointerCapture() {}

    closest(selector) {
      let cur = this;
      while (cur) {
        if (matchesSelector(cur, selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    querySelectorAll(selector) {
      const results = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (matchesSelector(child, selector)) results.push(child);
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
        for (const fn of [...list]) {
          fn.call(cur, event);
        }
        if (event._stopped) break;
        cur = event.bubbles === false ? null : cur.parentElement;
      }
      return !event.defaultPrevented;
    }
  }

  function makeEvent(type, props = {}) {
    const ev = {
      type,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      _stopped: false,
      preventDefault() {
        if (this.cancelable) this.defaultPrevented = true;
      },
      stopPropagation() {
        this._stopped = true;
      },
      ...props,
    };
    return ev;
  }

  const documentRoot = new ElementNode('html');
  const body = documentRoot.appendChild(new ElementNode('body', { className: 'model-page' }));

  // Build grouped horizontal rows with videos first followed by 3 gallery items
  const portfolioGroups = body.appendChild(new ElementNode('div', { className: 'portfolio-groups' }));
  const filterBar = body.appendChild(new ElementNode('div', { className: 'filters' }));
  const filterAll = filterBar.appendChild(new ElementNode('button', { className: 'filter is-active', attrs: { 'data-filter': 'all' } }));
  const filterBridal = filterBar.appendChild(new ElementNode('button', { className: 'filter', attrs: { 'data-filter': 'Bridal' } }));

  const bridalGroup = portfolioGroups.appendChild(new ElementNode('section', { className: 'media-group', attrs: { 'data-group': 'Bridal' } }));
  const bridalRow = bridalGroup.appendChild(new ElementNode('div', { className: 'media-row', attrs: { 'data-media-row': '' } }));

  const meeshoGroup = portfolioGroups.appendChild(new ElementNode('section', { className: 'media-group', attrs: { 'data-group': 'Meesho' } }));
  const meeshoRow = meeshoGroup.appendChild(new ElementNode('div', { className: 'media-row is-single', attrs: { 'data-media-row': '' } }));

  const videoNodes = [
    { title: 'Bridal', row: bridalRow },
    { title: 'Meesho', row: meeshoRow },
  ].map(({ title, row }) => {
    const card = row.appendChild(new ElementNode('figure', { className: 'media-card media-card--video video-card', attrs: { 'data-category': title } }));
    const frame = card.appendChild(new ElementNode('div', { className: 'video-frame' }));
    const vid = frame.appendChild(new ElementNode('video', { attrs: { 'aria-label': title } }));
    vid.videoWidth = 0;
    vid.videoHeight = 0;
    vid.paused = true;
    vid.muted = false;
    vid.readyState = 0;
    vid.duration = 32;
    vid.currentTime = 0;
    return { card, frame, vid };
  });

  const galleryButtons = [0, 1, 2].map((i) => {
    const fig = bridalRow.appendChild(new ElementNode('figure', { className: 'media-card media-card--photo gallery-item', attrs: { 'data-category': 'Bridal' } }));
    const btn = fig.appendChild(new ElementNode('button', {
      className: 'gallery-btn',
      attrs: {
        'data-src': `/media/demo/photo-${i + 1}.jpg`,
        'data-alt': `Photo ${i + 1}`,
        'data-caption': `Caption ${i + 1}`,
      },
    }));
    return btn;
  });

  // Build #lightbox dialog matching renderLightbox()
  const dialog = body.appendChild(new ElementNode('dialog', { id: 'lightbox', className: 'lightbox' }));
  dialog.showModal = function () { this.open = true; };
  dialog.close = function () {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(makeEvent('close', { bubbles: false }));
  };
  const lbInner = dialog.appendChild(new ElementNode('div', { className: 'lb-inner' }));
  const closeBtn = lbInner.appendChild(new ElementNode('button', { className: 'lb-btn lb-close' }));
  const prevBtn = lbInner.appendChild(new ElementNode('button', { className: 'lb-btn lb-prev' }));
  const stage = lbInner.appendChild(new ElementNode('div', { id: 'lb-stage', className: 'lb-stage carousel' }));
  const nextBtn = lbInner.appendChild(new ElementNode('button', { className: 'lb-btn lb-next' }));
  const caption = lbInner.appendChild(new ElementNode('p', { id: 'lb-caption', className: 'lb-caption' }));

  const windowListeners = new Map();
  const windowObj = {
    innerWidth: width,
    innerHeight: height,
    scrollY: 0,
    pageYOffset: 0,
    location: { hash: '' },
    history: { scrollRestoration: 'auto' },
    scrollTo() {},
    matchMedia() { return { matches: false }; },
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    dispatchEvent(ev) {
      for (const fn of windowListeners.get(ev.type) ?? []) fn(ev);
    },
    requestAnimationFrame(cb) {
      cb();
      return rafId++;
    },
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
  };

  const documentObj = {
    documentElement: documentRoot,
    body,
    getElementById(id) {
      return documentRoot.querySelector(`#${id}`);
    },
    querySelector(sel) {
      return documentRoot.querySelector(sel);
    },
    querySelectorAll(sel) {
      return documentRoot.querySelectorAll(sel);
    },
    createElement(tag) {
      const el = new ElementNode(tag);
      if (String(tag).toLowerCase() === 'canvas') {
        el.width = 0;
        el.height = 0;
        let lastDrawnVideo = null;
        el.getContext = () => ({
          drawImage(v) { lastDrawnVideo = v; },
          getImageData(_x, _y, w, h) {
            const px = new Uint8ClampedArray(Math.max(4, w * h * 4));
            // Simulate a fade-from-black frame before 0.3s and a bright frame after 0.3s
            const luma = lastDrawnVideo && lastDrawnVideo.currentTime < 0.3 ? 2 : 165;
            for (let i = 0; i < px.length; i += 4) {
              px[i] = luma;
              px[i + 1] = luma;
              px[i + 2] = luma;
              px[i + 3] = 255;
            }
            return { data: px };
          },
        });
        el.toDataURL = () => 'data:image/jpeg;base64,' + 'A'.repeat(200);
      }
      return el;
    },
    addEventListener() {},
  };

  const FakeDate = function (...args) {
    return new Date(...args);
  };
  FakeDate.now = () => clock;

  return {
    windowObj,
    documentObj,
    FakeDate,
    dialog,
    lbInner,
    stage,
    closeBtn,
    prevBtn,
    nextBtn,
    caption,
    galleryButtons,
    videoNodes,
    bridalGroup,
    meeshoGroup,
    filterAll,
    filterBridal,
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

function parseTransform(transform) {
  if (!transform) return { x: 0, y: 0, scale: 1 };
  const m = transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0\)\s*scale\(([-\d.]+)\)/);
  if (!m) return { x: 0, y: 0, scale: 1 };
  return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
}

test('unzoomed 1-finger swipe in popup still navigates between photos', async () => {
  const h = await createLightboxHarness();
  await h.boot();

  h.galleryButtons[0].dispatchEvent(h.makeEvent('click'));
  assert.equal(h.dialog.open, true);
  assert.equal(h.caption.textContent, 'Caption 1');
  assert.equal(h.stage.classList.contains('is-zoomed'), false);

  // Swipe left with 1 finger -> advances to slide 2
  h.stage.dispatchEvent(h.makeEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 400 }));
  h.advanceTime(40);
  h.stage.dispatchEvent(h.makeEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 140, clientY: 402 }));
  h.advanceTime(40);
  h.stage.dispatchEvent(h.makeEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 140, clientY: 402 }));
  h.advanceTime(450);

  assert.equal(h.caption.textContent, 'Caption 2');
  assert.equal(h.dialog.open, true);
});

test('two-finger pinch zooms the popup image, clamps pan while zoomed, and prevents accidental swipe or close', async () => {
  const h = await createLightboxHarness({ width: 390, height: 844, naturalWidth: 1200, naturalHeight: 1600 });
  await h.boot();

  h.galleryButtons[0].dispatchEvent(h.makeEvent('click'));
  const slides = h.stage.querySelectorAll('.carousel-slide');
  const img = slides[0].querySelector('img');

  // Finger 1 touches first (as happens on real mobile screens), then finger 2 joins for pinch
  h.stage.dispatchEvent(h.makeEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 145, clientY: 422 }));
  h.stage.dispatchEvent(h.makeEvent('touchstart', {
    touches: [{ clientX: 145, clientY: 422 }],
  }));
  h.stage.dispatchEvent(h.makeEvent('touchstart', {
    touches: [{ clientX: 145, clientY: 422 }, { clientX: 245, clientY: 422 }],
  }));

  // Spread fingers from 100px apart to 220px apart (2.2x zoom)
  const moveEv = h.makeEvent('touchmove', {
    touches: [{ clientX: 85, clientY: 422 }, { clientX: 305, clientY: 422 }],
  });
  h.stage.dispatchEvent(moveEv);
  assert.equal(moveEv.defaultPrevented, true, 'pinch touchmove prevents browser viewport scroll/zoom');
  assert.equal(h.stage.classList.contains('is-zoomed'), true);
  assert.equal(h.dialog.classList.contains('is-zoomed'), true);

  const zoomed = parseTransform(img.style.transform);
  assert.ok(Math.abs(zoomed.scale - 2.2) < 0.01, `expected ~2.2x zoom, got ${zoomed.scale}`);

  // Release both fingers -> stays zoomed at 2.2x, stays on Photo 1, and synthetic click does NOT close dialog
  h.stage.dispatchEvent(h.makeEvent('touchend', {
    touches: [{ clientX: 85, clientY: 422 }],
    changedTouches: [{ clientX: 305, clientY: 422 }],
  }));
  h.stage.dispatchEvent(h.makeEvent('touchend', {
    touches: [],
    changedTouches: [{ clientX: 85, clientY: 422 }],
  }));
  h.dialog.dispatchEvent(h.makeEvent('click', { target: h.stage, clientX: 195, clientY: 422 }));
  assert.equal(h.dialog.open, true, 'synthetic click after pinch must not close popup');
  assert.equal(h.caption.textContent, 'Caption 1', 'pinch must abort 1-finger carousel swipe');

  // While zoomed in, 1-finger drag pans the image (clamped to bounds) instead of swiping slides
  h.advanceTime(500);
  h.stage.dispatchEvent(h.makeEvent('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 422 }));
  h.stage.dispatchEvent(h.makeEvent('touchstart', {
    touches: [{ clientX: 250, clientY: 422 }],
  }));
  const panEv = h.makeEvent('touchmove', {
    touches: [{ clientX: 50, clientY: 422 }],
  });
  h.stage.dispatchEvent(panEv);
  h.stage.dispatchEvent(h.makeEvent('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 422 }));
  h.stage.dispatchEvent(h.makeEvent('touchend', {
    touches: [],
    changedTouches: [{ clientX: 50, clientY: 422 }],
  }));
  h.stage.dispatchEvent(h.makeEvent('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 422 }));
  h.advanceTime(450);

  assert.equal(h.caption.textContent, 'Caption 1', '1-finger drag while zoomed pans photo rather than changing slide');
  const panned = parseTransform(img.style.transform);
  // Base width fills 390px -> max horizontal pan at 2.2x is (390 * 2.2 - 390) / 2 = 234px
  assert.equal(panned.x, -200);
  assert.ok(Math.abs(panned.scale - 2.2) < 0.01);

  // Dragging way past the edge clamps strictly at -234px
  h.stage.dispatchEvent(h.makeEvent('touchstart', { touches: [{ clientX: 300, clientY: 422 }] }));
  h.stage.dispatchEvent(h.makeEvent('touchmove', { touches: [{ clientX: 0, clientY: 422 }] }));
  h.stage.dispatchEvent(h.makeEvent('touchend', { touches: [], changedTouches: [{ clientX: 0, clientY: 422 }] }));
  assert.equal(parseTransform(img.style.transform).x, -234);

  // Pinching back down to <= 1x resets zoom cleanly and restores 1-finger swipe
  h.stage.dispatchEvent(h.makeEvent('touchstart', {
    touches: [{ clientX: 75, clientY: 422 }, { clientX: 315, clientY: 422 }],
  }));
  h.stage.dispatchEvent(h.makeEvent('touchmove', {
    touches: [{ clientX: 155, clientY: 422 }, { clientX: 235, clientY: 422 }],
  }));
  h.stage.dispatchEvent(h.makeEvent('touchend', {
    touches: [],
    changedTouches: [{ clientX: 155, clientY: 422 }],
  }));
  assert.equal(h.stage.classList.contains('is-zoomed'), false);
  assert.equal(img.style.transform, '');
});

test('double-tap on popup photo zooms to 2.5x around tap point and double-tap again resets to 1x', async () => {
  const h = await createLightboxHarness({ width: 390, height: 844, naturalWidth: 1200, naturalHeight: 1600 });
  await h.boot();

  h.galleryButtons[0].dispatchEvent(h.makeEvent('click'));
  const slide0 = h.stage.querySelectorAll('.carousel-slide')[0];
  const img = slide0.querySelector('img');

  // Double-tap on the photo at (260, 420)
  h.stage.dispatchEvent(h.makeEvent('touchstart', { touches: [{ clientX: 260, clientY: 420 }] }));
  h.advanceTime(30);
  h.stage.dispatchEvent(h.makeEvent('touchend', { touches: [], changedTouches: [{ clientX: 260, clientY: 420 }] }));
  // First tap's click on the slide does not close the popup
  slide0.dispatchEvent(h.makeEvent('click', { clientX: 260, clientY: 420 }));
  assert.equal(h.dialog.open, true);

  h.advanceTime(120);
  h.stage.dispatchEvent(h.makeEvent('touchstart', { touches: [{ clientX: 262, clientY: 421 }] }));
  h.advanceTime(30);
  const secondEnd = h.makeEvent('touchend', { touches: [], changedTouches: [{ clientX: 262, clientY: 421 }] });
  h.stage.dispatchEvent(secondEnd);

  assert.equal(secondEnd.defaultPrevented, true);
  assert.equal(h.stage.classList.contains('is-zoomed'), true);
  const zoomed = parseTransform(img.style.transform);
  assert.equal(zoomed.scale, 2.5);
  assert.ok(zoomed.x < 0, 'zooming on right half shifts image left toward tap point');

  // Double-tap again resets back to 1x without closing the popup
  h.advanceTime(500);
  h.stage.dispatchEvent(h.makeEvent('touchstart', { touches: [{ clientX: 195, clientY: 422 }] }));
  h.advanceTime(25);
  h.stage.dispatchEvent(h.makeEvent('touchend', { touches: [], changedTouches: [{ clientX: 195, clientY: 422 }] }));
  h.advanceTime(110);
  h.stage.dispatchEvent(h.makeEvent('touchstart', { touches: [{ clientX: 195, clientY: 422 }] }));
  h.advanceTime(25);
  h.stage.dispatchEvent(h.makeEvent('touchend', { touches: [], changedTouches: [{ clientX: 195, clientY: 422 }] }));

  assert.equal(h.stage.classList.contains('is-zoomed'), false);
  assert.equal(img.style.transform, '');
  assert.equal(h.dialog.open, true);

  // Stepping to next photo while zoomed also resets zoom cleanly
  h.advanceTime(500);
  h.stage.dispatchEvent(h.makeEvent('touchstart', { touches: [{ clientX: 195, clientY: 422 }] }));
  h.advanceTime(20);
  h.stage.dispatchEvent(h.makeEvent('touchend', { touches: [], changedTouches: [{ clientX: 195, clientY: 422 }] }));
  h.advanceTime(100);
  h.stage.dispatchEvent(h.makeEvent('touchstart', { touches: [{ clientX: 195, clientY: 422 }] }));
  h.advanceTime(20);
  h.stage.dispatchEvent(h.makeEvent('touchend', { touches: [], changedTouches: [{ clientX: 195, clientY: 422 }] }));
  assert.equal(h.stage.classList.contains('is-zoomed'), true);

  h.nextBtn.dispatchEvent(h.makeEvent('click'));
  h.advanceTime(450);
  assert.equal(h.stage.classList.contains('is-zoomed'), false);
  assert.equal(img.style.transform, '');

  // Tapping the dark letterbox bar outside the photo (3:4 photo in 390x844 sits at y=162..682) closes the popup
  slide0.dispatchEvent(h.makeEvent('click', { clientX: 195, clientY: 40 }));
  assert.equal(h.dialog.open, false);
});

test('existing R2 portrait videos without saved dimensions switch to portrait video players on loadedmetadata', async () => {
  const h = await createLightboxHarness();
  await h.boot();

  const [bridal, meesho] = h.videoNodes;
  assert.equal(bridal.card.classList.contains('is-portrait'), false);

  bridal.vid.videoWidth = 1080;
  bridal.vid.videoHeight = 1920;
  bridal.vid.dispatchEvent(h.makeEvent('loadedmetadata', { bubbles: false }));

  assert.equal(bridal.card.classList.contains('is-portrait'), true);
  assert.equal(bridal.vid.style.aspectRatio, '1080 / 1920');

  meesho.vid.videoWidth = 720;
  meesho.vid.videoHeight = 1280;
  meesho.vid.dispatchEvent(h.makeEvent('loadedmetadata', { bubbles: false }));

  assert.equal(meesho.card.classList.contains('is-portrait'), true);
  assert.equal(meesho.vid.style.aspectRatio, '720 / 1280');

  // Filtering to "Bridal" hides the "Meesho" group row while keeping "Bridal" visible
  h.filterBridal.dispatchEvent(h.makeEvent('click'));
  assert.equal(h.bridalGroup.hidden, false);
  assert.equal(h.meeshoGroup.hidden, true);
  h.filterAll.dispatchEvent(h.makeEvent('click'));
  assert.equal(h.meeshoGroup.hidden, false);
});

test('videos without a custom poster show their thumbnail on load (skipping black intro frames and priming iOS Safari)', async () => {
  const h = await createLightboxHarness();
  await h.boot();

  const [bridal, meesho] = h.videoNodes;

  // 1. Video 1 ("Bridal") decodes frame data naturally, detects dark intro at 0.15s, steps to 1.0s, and sets poster
  bridal.vid.videoWidth = 1080;
  bridal.vid.videoHeight = 1920;
  bridal.vid.readyState = 1;
  bridal.vid.dispatchEvent(h.makeEvent('loadedmetadata', { bubbles: false }));
  assert.ok(bridal.vid.currentTime > 0, 'seeks past 0.00s for initial frame');

  bridal.vid.readyState = 2;
  bridal.vid.dispatchEvent(h.makeEvent('loadeddata', { bubbles: false }));
  // Because 0.15s was dark in our mock, it stepped forward to 1.0s to find a bright frame
  assert.equal(bridal.vid.currentTime, 1);

  bridal.vid.dispatchEvent(h.makeEvent('seeked', { bubbles: false }));
  assert.match(bridal.vid.getAttribute('poster') || '', /^data:image\/jpeg;base64,/);

  // 2. Video 2 ("Meesho") simulates iOS Safari stopping at HAVE_METADATA (readyState === 1) until play() primes it
  let primedPlayCalls = 0;
  let pausedAfterPrime = false;
  meesho.vid.videoWidth = 720;
  meesho.vid.videoHeight = 1280;
  meesho.vid.readyState = 1;
  meesho.vid.muted = false;
  meesho.vid.play = () => {
    primedPlayCalls++;
    assert.equal(meesho.vid.muted, true, 'silent decoder prime must be muted');
    meesho.vid.readyState = 2;
    meesho.vid.currentTime = 0.5;
    return {
      then(onFulfilled) {
        onFulfilled();
      },
    };
  };
  meesho.vid.pause = () => {
    pausedAfterPrime = true;
  };

  meesho.vid.dispatchEvent(h.makeEvent('loadedmetadata', { bubbles: false }));
  h.advanceTime(300);

  assert.equal(primedPlayCalls, 1, 'primes hardware decoder when stuck at HAVE_METADATA');
  assert.equal(pausedAfterPrime, true, 'immediately pauses after priming 1 frame');
  assert.equal(meesho.vid.muted, false, 'restores original unmuted state for user playback');
  assert.match(meesho.vid.getAttribute('poster') || '', /^data:image\/jpeg;base64,/);
});



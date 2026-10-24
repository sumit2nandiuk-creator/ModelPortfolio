// Behavioural tests for mobile swiping inside the fullscreen photo popup (#lightbox).
// Runs the real site/assets/site.js in a minimal DOM with PointerEvent simulation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteJsPath = path.join(repoRoot, 'site', 'assets', 'site.js');
const siteCssPath = path.join(repoRoot, 'site', 'assets', 'site.css');

// Minimal DOM implementation sufficient to run site/assets/site.js and inspect
// slide transforms, transitions, visibility, image preloading and dialog state.
function createTestDom({ photoCount = 8, screenWidth = 390, screenHeight = 844 } = {}) {
  let now = 1000;
  let nextTimerId = 1;
  const timers = new Map();
  const rafQueue = new Map();
  let nextRafId = 1;

  class ClassList {
    constructor(el) {
      this.el = el;
      this.set = new Set();
    }
    _syncFromAttr(val) {
      this.set = new Set(String(val || '').split(/\s+/).filter(Boolean));
    }
    add(...names) { names.forEach((n) => n && this.set.add(n)); }
    remove(...names) { names.forEach((n) => this.set.delete(n)); }
    contains(n) { return this.set.has(n); }
    toggle(n, force) {
      const shouldAdd = force === undefined ? !this.set.has(n) : Boolean(force);
      if (shouldAdd) this.set.add(n);
      else this.set.delete(n);
      return shouldAdd;
    }
    toString() { return [...this.set].join(' '); }
  }

  function matchesSingle(el, sel) {
    if (!el || el.nodeType !== 1) return false;
    sel = sel.trim();
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('[')) {
      const name = sel.slice(1, -1);
      return el.attributes.has(name);
    }
    if (sel.includes('.')) {
      const parts = sel.split('.').filter(Boolean);
      const startsWithTag = !sel.startsWith('.');
      const tag = startsWithTag ? parts.shift().toUpperCase() : null;
      if (tag && el.tagName !== tag) return false;
      return parts.every((c) => el.classList.contains(c));
    }
    return el.tagName === sel.toUpperCase();
  }

  function matchesSelector(el, selectorGroup) {
    return selectorGroup.split(',').some((s) => matchesSingle(el, s));
  }

  class MiniElement {
    constructor(tagName) {
      this.nodeType = 1;
      this.tagName = tagName.toUpperCase();
      this.id = '';
      this.parentNode = null;
      this.children = [];
      this.attributes = new Map();
      this.style = { transition: '', transform: '', visibility: '', willChange: '' };
      this.classList = new ClassList(this);
      this.listeners = new Map();
      this.hidden = false;
      this.inert = false;
      this.draggable = true;
      this.decoding = 'auto';
      this.open = false;
      this._textContent = '';
      this.naturalWidth = 1200;
      this.naturalHeight = 1800;
      this.decodeCalls = 0;
    }
    get className() { return this.classList.toString(); }
    set className(v) { this.classList._syncFromAttr(v); }
    get textContent() { return this._textContent; }
    set textContent(v) {
      this._textContent = String(v ?? '');
      if (this._textContent === '') {
        this.children.forEach((c) => { c.parentNode = null; });
        this.children = [];
      }
    }
    get alt() { return this.getAttribute('alt') || ''; }
    set alt(v) { this.setAttribute('alt', v); }
    get clientWidth() {
      // Closed <dialog> has display:none -> 0 width in real browsers.
      let p = this;
      while (p) {
        if (p.tagName === 'DIALOG' && !p.open) return 0;
        p = p.parentNode;
      }
      return screenWidth;
    }
    get offsetWidth() { return this.clientWidth; }
    getBoundingClientRect() {
      if (this.clientWidth === 0) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      return { left: 0, top: 0, right: screenWidth, bottom: screenHeight, width: screenWidth, height: screenHeight };
    }
    setAttribute(k, v) {
      const str = String(v);
      this.attributes.set(k, str);
      if (k === 'id') this.id = str;
      if (k === 'class') this.classList._syncFromAttr(str);
    }
    getAttribute(k) {
      return this.attributes.has(k) ? this.attributes.get(k) : null;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    closest(selector) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matchesSelector(cur, selector)) return cur;
        cur = cur.parentNode;
      }
      return null;
    }
    querySelectorAll(selector) {
      const out = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (matchesSelector(child, selector)) out.push(child);
          visit(child);
        }
      };
      visit(this);
      return out;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    addEventListener(type, fn, opts) {
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push({ fn, capture });
    }
    dispatchEvent(event) {
      event.target = event.target || this;
      const path = [];
      let cur = this;
      while (cur) {
        path.push(cur);
        cur = cur.parentNode;
      }
      // Capture phase (root -> target)
      for (let i = path.length - 1; i >= 0; i--) {
        if (event._stopped) break;
        const list = path[i].listeners.get(event.type) || [];
        for (const l of list) {
          if (l.capture || i === 0 && l.capture) {
            if (l.capture) {
              event.currentTarget = path[i];
              l.fn(event);
              if (event._stoppedImmediate) break;
            }
          }
        }
      }
      // Bubble phase (target -> root)
      const bubbles = event.bubbles !== false;
      const bubbleCount = bubbles ? path.length : 1;
      for (let i = 0; i < bubbleCount; i++) {
        if (event._stopped) break;
        const list = path[i].listeners.get(event.type) || [];
        for (const l of list) {
          if (!l.capture) {
            event.currentTarget = path[i];
            l.fn(event);
            if (event._stoppedImmediate) break;
          }
        }
      }
      return !event.defaultPrevented;
    }
    setPointerCapture() {}
    focus() {}
    decode() {
      this.decodeCalls++;
      return Promise.resolve();
    }
    showModal() {
      if (this.open) throw new Error('Dialog already open');
      this.open = true;
    }
    close() {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(makeEvent('close', { bubbles: false }));
    }
  }

  function makeEvent(type, props = {}) {
    return {
      type,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 0,
      clientY: 0,
      ...props,
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; },
      stopPropagation() { this._stopped = true; },
      stopImmediatePropagation() { this._stopped = true; this._stoppedImmediate = true; },
    };
  }

  // Build document tree matching render.mjs
  const documentElement = new MiniElement('html');
  const body = documentElement.appendChild(new MiniElement('body'));

  const gallery = body.appendChild(new MiniElement('div'));
  gallery.className = 'gallery';
  const galleryButtons = [];
  for (let i = 0; i < photoCount; i++) {
    const fig = gallery.appendChild(new MiniElement('figure'));
    fig.className = 'gallery-item';
    fig.setAttribute('data-category', i < 2 ? 'Traditional' : 'Bridal');
    const btn = fig.appendChild(new MiniElement('button'));
    btn.className = 'gallery-btn';
    btn.setAttribute('data-src', `/sushmita-ghosh/media/photo-${i}.jpg`);
    btn.setAttribute('data-alt', `Photo ${i}`);
    btn.setAttribute('data-caption', i < 2 ? 'Traditional' : 'Bridal');
    galleryButtons.push(btn);
  }

  const dialog = body.appendChild(new MiniElement('dialog'));
  dialog.id = 'lightbox';
  dialog.className = 'lightbox';
  const lbInner = dialog.appendChild(new MiniElement('div'));
  lbInner.className = 'lb-inner';
  const closeBtn = lbInner.appendChild(new MiniElement('button'));
  closeBtn.className = 'lb-btn lb-close';
  const prevBtn = lbInner.appendChild(new MiniElement('button'));
  prevBtn.className = 'lb-btn lb-prev';
  const stage = lbInner.appendChild(new MiniElement('div'));
  stage.id = 'lb-stage';
  stage.className = 'carousel lb-stage';
  const nextBtn = lbInner.appendChild(new MiniElement('button'));
  nextBtn.className = 'lb-btn lb-next';
  const caption = lbInner.appendChild(new MiniElement('p'));
  caption.id = 'lb-caption';
  caption.className = 'lb-caption';
  caption.hidden = true;

  const docListeners = new Map();
  const document = {
    documentElement,
    body,
    createElement: (tag) => new MiniElement(tag),
    getElementById: (id) => documentElement.querySelector(`#${id}`),
    querySelector: (sel) => documentElement.querySelector(sel),
    querySelectorAll: (sel) => documentElement.querySelectorAll(sel),
    addEventListener(type, fn, opts) {
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push({ fn, capture });
    },
  };
  documentElement.parentNode = {
    nodeType: 9,
    parentNode: null,
    listeners: docListeners,
  };

  const windowObj = {
    document,
    innerWidth: screenWidth,
    innerHeight: screenHeight,
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    requestAnimationFrame(fn) {
      const id = nextRafId++;
      rafQueue.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) {
      rafQueue.delete(id);
    },
    setTimeout(fn, ms) {
      const id = nextTimerId++;
      timers.set(id, { fn, runAt: now + ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };

  function flushFrames() {
    const fns = [...rafQueue.values()];
    rafQueue.clear();
    fns.forEach((fn) => fn(now));
  }

  function advanceTime(ms) {
    now += ms;
    flushFrames();
    let ran = true;
    while (ran) {
      ran = false;
      for (const [id, entry] of [...timers.entries()]) {
        if (entry.runAt <= now) {
          timers.delete(id);
          entry.fn();
          ran = true;
        }
      }
    }
  }

  const FakeDate = function () { return new Date(now); };
  FakeDate.now = () => now;

  return {
    window: windowObj,
    document,
    Date: FakeDate,
    dialog,
    lbInner,
    stage,
    prevBtn,
    nextBtn,
    closeBtn,
    galleryButtons,
    makeEvent,
    flushFrames,
    advanceTime,
    slideX(i) {
      const slide = stage.children[i];
      const m = slide.style.transform.match(/translate3d\(([-\d.]+)px/);
      return m ? Number(m[1]) : NaN;
    },
    currentIndex() {
      return stage.children.findIndex((el) => el.classList.contains('is-current'));
    },
  };
}

async function bootViewer(opts) {
  const code = await fs.readFile(siteJsPath, 'utf8');
  const env = createTestDom(opts);
  const context = vm.createContext({
    window: env.window,
    document: env.document,
    Date: env.Date,
    setTimeout: env.window.setTimeout,
    clearTimeout: env.window.clearTimeout,
  });
  vm.runInContext(code, context, { filename: 'site.js' });
  return env;
}

test('popup CSS blocks vertical browser scroll/pull-to-refresh cancellation while keeping cover pan-y', async () => {
  const css = await fs.readFile(siteCssPath, 'utf8');
  const carouselRule = css.match(/\.carousel\s*\{[^}]*\}/)?.[0] ?? '';
  const lbRule = css.match(/\.lightbox\s*\{[^}]*\}/)?.[0] ?? '';
  const stageRule = css.match(/\.lb-stage\s*\{[^}]*\}/)?.[0] ?? '';
  assert.match(carouselRule, /touch-action:\s*pan-y/);
  assert.match(lbRule, /touch-action:\s*none/);
  assert.match(stageRule, /touch-action:\s*none/);
  assert.match(stageRule, /overscroll-behavior:\s*none/);
});

test('opening the popup shows the modal before laying out slides and preloads both left and right neighbours', async () => {
  const env = await bootViewer({ photoCount: 8, screenWidth: 390 });
  env.galleryButtons[0].dispatchEvent(env.makeEvent('click'));

  assert.equal(env.dialog.open, true);
  assert.equal(env.currentIndex(), 0);
  // Left neighbour (photo 7), current (photo 0) and right neighbour (photo 1) are positioned and loaded.
  assert.equal(env.slideX(0), 0);
  assert.equal(env.slideX(7), -390);
  assert.equal(env.slideX(1), 390);
  for (const idx of [6, 7, 0, 1, 2]) {
    const img = env.stage.children[idx].querySelector('img');
    assert.equal(img.getAttribute('src'), `/sushmita-ghosh/media/photo-${idx}.jpg`);
    assert.ok(img.decodeCalls >= 1, `photo ${idx} should start decoding immediately`);
  }
});

test('swiping left-to-right wraps from photo 0 to the last photo and slides smoothly in the swipe direction', async () => {
  const env = await bootViewer({ photoCount: 8, screenWidth: 390 });
  env.galleryButtons[0].dispatchEvent(env.makeEvent('click'));

  const target = env.stage.children[0];
  target.dispatchEvent(env.makeEvent('pointerdown', { clientX: 60, clientY: 420 }));
  env.advanceTime(16);
  target.dispatchEvent(env.makeEvent('pointermove', { clientX: 80, clientY: 424 }));
  env.advanceTime(32);
  target.dispatchEvent(env.makeEvent('pointermove', { clientX: 200, clientY: 426 }));
  env.flushFrames();

  // Mid-drag: photo 0 moved +140px right, photo 7 came in from left (-390 + 140 = -250px).
  assert.equal(env.slideX(0), 140);
  assert.equal(env.slideX(7), -250);

  env.advanceTime(16);
  target.dispatchEvent(env.makeEvent('pointerup', { clientX: 200, clientY: 426 }));

  // Upon release: photo 7 animates to 0, photo 0 exits right to +390 (not left!).
  assert.equal(env.currentIndex(), 7);
  assert.equal(env.slideX(7), 0);
  assert.equal(env.slideX(0), 390);
  assert.match(env.stage.children[7].style.transition, /transform/);
  assert.match(env.stage.children[0].style.transition, /transform/);

  // Synthetic click on letterboxed area right after swipe does NOT close the popup.
  target.dispatchEvent(env.makeEvent('click', { clientX: 200, clientY: 50 }));
  assert.equal(env.dialog.open, true);

  env.advanceTime(500);
  assert.equal(env.slideX(7), 0);
  assert.equal(env.slideX(6), -390);
  assert.equal(env.slideX(0), 390);
});

test('2-photo category (e.g. Traditional): swiping left-to-right exits the old slide to +width instead of flying backwards to -width', async () => {
  const env = await bootViewer({ photoCount: 2, screenWidth: 390 });
  env.galleryButtons[0].dispatchEvent(env.makeEvent('click'));

  const slide0 = env.stage.children[0];
  slide0.dispatchEvent(env.makeEvent('pointerdown', { clientX: 50, clientY: 400 }));
  env.advanceTime(16);
  slide0.dispatchEvent(env.makeEvent('pointermove', { clientX: 70, clientY: 400 }));
  env.advanceTime(20);
  slide0.dispatchEvent(env.makeEvent('pointermove', { clientX: 190, clientY: 400 }));
  env.flushFrames();

  assert.equal(env.slideX(0), 140);
  assert.equal(env.slideX(1), -250);

  slide0.dispatchEvent(env.makeEvent('pointerup', { clientX: 190, clientY: 400 }));
  // Slide 0 was at +140px and MUST exit to +390px on the right, never -390px across the screen!
  assert.equal(env.currentIndex(), 1);
  assert.equal(env.slideX(1), 0);
  assert.equal(env.slideX(0), 390);
});

test('3-photo gallery: swiping left-to-right hides the wrapping 3rd slide so it never flies across the viewport', async () => {
  const env = await bootViewer({ photoCount: 3, screenWidth: 390 });
  env.galleryButtons[0].dispatchEvent(env.makeEvent('click'));

  const slide0 = env.stage.children[0];
  slide0.dispatchEvent(env.makeEvent('pointerdown', { clientX: 40, clientY: 400 }));
  env.advanceTime(16);
  slide0.dispatchEvent(env.makeEvent('pointermove', { clientX: 180, clientY: 400 }));
  env.flushFrames();
  slide0.dispatchEvent(env.makeEvent('pointerup', { clientX: 180, clientY: 400 }));

  assert.equal(env.currentIndex(), 2);
  // Slide 1 wrapped from +390 to -390: it must NOT animate visibly across the screen!
  assert.equal(env.stage.children[1].style.transition, 'none');
  assert.equal(env.stage.children[1].style.visibility, 'hidden');
});

test('angled thumb start in the popup still swipes horizontally instead of locking to vertical scroll', async () => {
  const env = await bootViewer({ photoCount: 8, screenWidth: 390 });
  env.galleryButtons[2].dispatchEvent(env.makeEvent('click'));

  const slide = env.stage.children[2];
  slide.dispatchEvent(env.makeEvent('pointerdown', { clientX: 80, clientY: 500 }));
  env.advanceTime(16);
  // Thumb initially moves 10px up and only 4px right — previously this locked axis='y' and killed the swipe!
  slide.dispatchEvent(env.makeEvent('pointermove', { clientX: 84, clientY: 490 }));
  env.advanceTime(16);
  // Thumb continues horizontally left-to-right
  slide.dispatchEvent(env.makeEvent('pointermove', { clientX: 210, clientY: 485 }));
  env.flushFrames();
  assert.equal(env.slideX(2), 130);

  slide.dispatchEvent(env.makeEvent('pointerup', { clientX: 210, clientY: 485 }));
  assert.equal(env.currentIndex(), 1);
});

test('swipe starting directly on the left arrow button (.lb-prev) still drags the photo smoothly', async () => {
  const env = await bootViewer({ photoCount: 8, screenWidth: 390 });
  env.galleryButtons[3].dispatchEvent(env.makeEvent('click'));

  // Thumb touches down right on prevBtn (x=28, y=422) and swipes right to x=200
  env.prevBtn.dispatchEvent(env.makeEvent('pointerdown', { clientX: 28, clientY: 422 }));
  env.advanceTime(16);
  env.prevBtn.dispatchEvent(env.makeEvent('pointermove', { clientX: 50, clientY: 422 }));
  env.advanceTime(16);
  env.lbInner.dispatchEvent(env.makeEvent('pointermove', { clientX: 200, clientY: 422 }));
  env.flushFrames();

  assert.equal(env.slideX(3), 172);
  env.lbInner.dispatchEvent(env.makeEvent('pointerup', { clientX: 200, clientY: 422 }));
  assert.equal(env.currentIndex(), 2);
});

test('rapid consecutive left-to-right swipes work immediately without waiting for the previous slide animation to finish', async () => {
  const env = await bootViewer({ photoCount: 8, screenWidth: 390 });
  env.galleryButtons[4].dispatchEvent(env.makeEvent('click'));

  // First left-to-right swipe: 4 -> 3
  const s4 = env.stage.children[4];
  s4.dispatchEvent(env.makeEvent('pointerdown', { clientX: 60, clientY: 400 }));
  env.advanceTime(16);
  s4.dispatchEvent(env.makeEvent('pointermove', { clientX: 190, clientY: 400 }));
  env.flushFrames();
  s4.dispatchEvent(env.makeEvent('pointerup', { clientX: 190, clientY: 400 }));
  assert.equal(env.currentIndex(), 3);

  // Only 120ms later (mid-animation!), swipe left-to-right again: 3 -> 2
  env.advanceTime(120);
  const s3 = env.stage.children[3];
  s3.dispatchEvent(env.makeEvent('pointerdown', { clientX: 60, clientY: 100 })); // even in dark letterbox area!
  env.advanceTime(16);
  s3.dispatchEvent(env.makeEvent('pointermove', { clientX: 190, clientY: 100 }));
  env.flushFrames();
  s3.dispatchEvent(env.makeEvent('pointerup', { clientX: 190, clientY: 100 }));
  s3.dispatchEvent(env.makeEvent('click', { clientX: 190, clientY: 100 }));

  assert.equal(env.dialog.open, true, 'popup stays open during rapid swipes in letterbox area');
  assert.equal(env.currentIndex(), 2);
});

test('pausing finger on photo before a quick flick still commits the swipe, and second-finger touch is ignored', async () => {
  const env = await bootViewer({ photoCount: 8, screenWidth: 390 });
  env.galleryButtons[2].dispatchEvent(env.makeEvent('click'));

  const s2 = env.stage.children[2];
  s2.dispatchEvent(env.makeEvent('pointerdown', { pointerId: 1, isPrimary: true, clientX: 100, clientY: 400 }));
  // Hold still for 450ms inspecting the photo
  env.advanceTime(450);

  // Accidental second finger touches bezel mid-gesture — must not hijack or freeze drag
  s2.dispatchEvent(env.makeEvent('pointerdown', { pointerId: 2, isPrimary: false, clientX: 380, clientY: 700 }));
  s2.dispatchEvent(env.makeEvent('pointerup', { pointerId: 2, isPrimary: false, clientX: 380, clientY: 700 }));

  // Quick 50px flick left-to-right in 50ms (1.0 px/ms, under 18% distance threshold)
  s2.dispatchEvent(env.makeEvent('pointermove', { pointerId: 1, clientX: 115, clientY: 400 }));
  env.advanceTime(25);
  s2.dispatchEvent(env.makeEvent('pointermove', { pointerId: 1, clientX: 150, clientY: 400 }));
  env.flushFrames();
  env.advanceTime(10);
  s2.dispatchEvent(env.makeEvent('pointerup', { pointerId: 1, clientX: 150, clientY: 400 }));

  assert.equal(env.currentIndex(), 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proofreadJsPath = path.join(root, 'site', 'admin', 'proofread.js');
const adminJsPath = path.join(root, 'site', 'admin', 'admin.js');

// Lightweight DOM + XHR harness for site/admin/admin.js upload & preview progress flows.
function createAdminUploadHarness(modelOverrides = {}) {
  const xhrs = [];
  const savedPayloads = [];
  const storage = new Map([['admin.token', 'secret-token']]);

  class ClassList {
    constructor(initial = []) { this._s = new Set(initial.filter(Boolean)); }
    add(...n) { n.forEach((x) => this._s.add(x)); }
    remove(...n) { n.forEach((x) => this._s.delete(x)); }
    contains(x) { return this._s.has(x); }
    toggle(x, force) {
      const on = force === undefined ? !this._s.has(x) : Boolean(force);
      if (on) this._s.add(x); else this._s.delete(x);
      return on;
    }
    toArray() { return [...this._s]; }
  }

  function matchSingle(el, token) {
    if (!el || el.nodeType !== 1) return false;
    if (token.startsWith('#')) return el.id === token.slice(1);
    if (token.startsWith('.')) {
      return token.split('.').filter(Boolean).every((c) => el.classList.contains(c));
    }
    const attrMatch = /^([a-z0-9_-]*)\[([a-z0-9_-]+)(?:="([^"]*)")?\]$/i.exec(token);
    if (attrMatch) {
      const [, tag, attr, val] = attrMatch;
      if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
      if (!el.hasAttribute(attr)) return false;
      return val === undefined ? true : el.getAttribute(attr) === val;
    }
    return el.tagName.toLowerCase() === token.toLowerCase();
  }

  function matches(el, selector) {
    return selector.split(',').some((raw) => {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return false;
      let cur = el;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (i === parts.length - 1) {
          if (!matchSingle(cur, parts[i])) return false;
        } else {
          cur = cur.parentElement;
          while (cur && !matchSingle(cur, parts[i])) cur = cur.parentElement;
          if (!cur) return false;
        }
      }
      return true;
    });
  }

  function parseHtmlFragment(html, ownerDoc) {
    const nodes = [];
    const tagRe = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)([^>]*?)(\/?)>/g;
    const voidTags = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source']);
    const stack = [{ children: nodes, parent: null }];
    let lastIdx = 0;

    const decodeEntities = (s) => s
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    let m;
    while ((m = tagRe.exec(html))) {
      if (m.index > lastIdx) {
        const text = decodeEntities(html.slice(lastIdx, m.index));
        if (text) {
          const tn = { nodeType: 3, nodeValue: text, parentElement: stack[stack.length - 1].el ?? null };
          stack[stack.length - 1].children.push(tn);
        }
      }
      lastIdx = tagRe.lastIndex;
      if (m[0].startsWith('<!--')) continue;
      if (m[1]) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const tag = m[2];
      const attrStr = m[3] || '';
      const selfClose = Boolean(m[4]) || voidTags.has(tag.toLowerCase());
      const el = ownerDoc.createElement(tag);
      const attrRe = /([a-zA-Z0-9_:-]+)(?:="([^"]*)"|='([^']*)'|=([^\s>]+))?/g;
      let am;
      while ((am = attrRe.exec(attrStr))) {
        const k = am[1];
        const v = decodeEntities(am[2] ?? am[3] ?? am[4] ?? '');
        el.setAttribute(k, v);
      }
      const parentFrame = stack[stack.length - 1];
      if (parentFrame.el) parentFrame.el.appendChild(el);
      else parentFrame.children.push(el);

      if (!selfClose) {
        stack.push({ el, children: el.childNodes });
      }
    }
    if (lastIdx < html.length) {
      const tail = decodeEntities(html.slice(lastIdx));
      if (tail) stack[stack.length - 1].children.push({ nodeType: 3, nodeValue: tail, parentElement: stack[stack.length - 1].el ?? null });
    }
    return nodes;
  }

  class MiniElement {
    constructor(tagName, ownerDoc) {
      this.nodeType = 1;
      this.tagName = tagName.toUpperCase();
      this.ownerDocument = ownerDoc;
      this.id = '';
      this.classList = new ClassList();
      this.attributes = new Map();
      this.childNodes = [];
      this.parentElement = null;
      this.listeners = new Map();
      this.captureListeners = new Map();
      this.style = {};
      this.hidden = false;
      this.disabled = false;
      this.value = '';
      this.files = null;
      this.complete = false;
      this.naturalWidth = 100;
      this.readyState = 0;
    }

    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }

    get className() { return this.classList.toArray().join(' '); }
    set className(v) {
      this.classList = new ClassList(String(v).split(/\s+/));
      this.attributes.set('class', String(v));
    }

    get textContent() {
      return this.childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.textContent)).join('');
    }
    set textContent(v) {
      this.childNodes = v === '' ? [] : [{ nodeType: 3, nodeValue: String(v), parentElement: this }];
    }

    get innerHTML() { return this._rawHtml || ''; }
    set innerHTML(html) {
      this._rawHtml = String(html);
      this.childNodes = [];
      for (const n of parseHtmlFragment(String(html), this.ownerDocument)) {
        if (n.nodeType === 1) this.appendChild(n);
        else { n.parentElement = this; this.childNodes.push(n); }
      }
    }

    setAttribute(k, v) {
      const sv = String(v);
      this.attributes.set(k, sv);
      if (k === 'id') this.id = sv;
      if (k === 'class') this.classList = new ClassList(sv.split(/\s+/));
      if (k === 'hidden') this.hidden = true;
      if (k === 'disabled') this.disabled = true;
      if (k === 'value') this.value = sv;
      if (k === 'type') this.type = sv;
    }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }

    appendChild(child) {
      child.parentElement = this;
      this.childNodes.push(child);
      return child;
    }

    closest(sel) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matches(cur, sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (matches(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }

    addEventListener(type, fn, useCapture = false) {
      const map = useCapture ? this.captureListeners : this.listeners;
      if (!map.has(type)) map.set(type, []);
      map.get(type).push(fn);
    }

    dispatchEvent(ev) {
      ev.target = ev.target ?? this;
      const pathNodes = [];
      let p = this;
      while (p) { pathNodes.push(p); p = p.parentElement; }

      // Capture phase (top -> target)
      for (let i = pathNodes.length - 1; i >= 0; i--) {
        const cur = pathNodes[i];
        for (const fn of cur.captureListeners.get(ev.type) ?? []) fn.call(cur, ev);
      }
      // Bubble phase (target -> top)
      if (ev.bubbles !== false) {
        for (let i = 0; i < pathNodes.length; i++) {
          const cur = pathNodes[i];
          for (const fn of cur.listeners.get(ev.type) ?? []) fn.call(cur, ev);
        }
      } else {
        for (const fn of this.listeners.get(ev.type) ?? []) fn.call(this, ev);
      }
    }
  }

  const doc = {
    createElement(tag) { return new MiniElement(tag, doc); },
    addEventListener() {},
  };

  const rootEl = doc.createElement('html');
  const headEl = rootEl.appendChild(doc.createElement('head'));
  const bodyEl = rootEl.appendChild(doc.createElement('body'));
  doc.head = headEl;
  doc.body = bodyEl;
  doc.getElementById = (id) => rootEl.querySelector(`#${id}`);
  doc.querySelector = (s) => rootEl.querySelector(s);
  doc.querySelectorAll = (s) => rootEl.querySelectorAll(s);

  // Build admin/index.html skeleton
  bodyEl.innerHTML = `
    <div id="top-actions" hidden>
      <select id="model-picker"></select>
      <button id="new-model"></button>
      <a id="view-site"></a>
      <button id="sign-out"></button>
    </div>
    <section id="login" hidden><form id="login-form"><input id="token"><p id="login-error"></p></form></section>
    <section id="setup" hidden></section>
    <section id="editor" hidden>
      <div id="status" class="status"></div>
      <div id="editor-body"></div>
      <div class="savebar">
        <div id="savebar-progress" class="savebar-progress" hidden></div>
        <div class="savebar-row">
          <span id="dirty-note"></span>
          <button id="save">Save changes</button>
        </div>
      </div>
    </section>
    <div id="toast" hidden></div>
  `;

  class FakeXHR {
    constructor() {
      this.headers = {};
      this.listeners = {};
      this.upload = {
        listeners: {},
        addEventListener(type, fn) {
          (this.listeners[type] ||= []).push(fn);
        },
        emit(type, ev = {}) {
          for (const fn of this.listeners[type] || []) fn(ev);
        },
      };
      this.status = 0;
      this.responseText = '';
      this.aborted = false;
      xhrs.push(this);
    }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(k, v) { this.headers[k] = v; }
    getResponseHeader(k) { return k.toLowerCase() === 'content-type' ? 'application/json' : ''; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type, ev = {}) { for (const fn of this.listeners[type] || []) fn(ev); }
    send(form) { this.sentForm = form; }
    abort() { this.aborted = true; this.emit('abort'); }
  }

  class FakeFormData {
    constructor() { this.entries = []; }
    append(name, value, filename) { this.entries.push({ name, value, filename }); }
  }

  const fakeModel = {
    slug: 'sushmita-ghosh',
    name: 'Sushmita Ghosh',
    cover: [{ file: 'cover.jpg', alt: 'Cover' }],
    photos: [],
    videos: [],
    ...modelOverrides,
  };

  async function fakeFetch(url, opts = {}) {
    if (url.endsWith('/api/models')) {
      return {
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ models: ['sushmita-ghosh'] }),
      };
    }
    if (url.endsWith('/api/models/sushmita-ghosh') && (!opts.method || opts.method === 'GET')) {
      return {
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sha: 'v-1', model: JSON.parse(JSON.stringify(fakeModel)) }),
      };
    }
    if (url.endsWith('/api/models/sushmita-ghosh') && opts.method === 'PUT') {
      if (nextSaveError) {
        const errSpec = nextSaveError;
        nextSaveError = null;
        return {
          status: errSpec.status || 400,
          ok: false,
          headers: { get: () => 'application/json' },
          json: async () => ({ error: errSpec.error, errors: errSpec.errors || [] }),
        };
      }
      const parsed = JSON.parse(opts.body);
      savedPayloads.push(parsed);
      return {
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sha: 'v-2', model: parsed.model }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }

  const win = {
    ADMIN_CONFIG: { apiBase: '' },
    addEventListener() {},
    confirm: () => true,
  };

  const localStore = new Map();
  let nextTimerId = 1;
  const pendingTimers = new Map();
  let nextSaveError = null;

  return {
    doc,
    xhrs,
    savedPayloads,
    failNextSave(spec) {
      nextSaveError = spec;
    },
    runTimers() {
      for (const [id, fn] of [...pendingTimers.entries()]) {
        pendingTimers.delete(id);
        fn();
      }
    },
    async boot() {
      const [proofreadCode, code] = await Promise.all([
        fs.readFile(proofreadJsPath, 'utf8'),
        fs.readFile(adminJsPath, 'utf8'),
      ]);
      const ctx = vm.createContext({
        window: win,
        document: doc,
        sessionStorage: {
          getItem: (k) => storage.get(k) ?? null,
          setItem: (k, v) => storage.set(k, String(v)),
          removeItem: (k) => storage.delete(k),
        },
        localStorage: {
          getItem: (k) => localStore.get(k) ?? null,
          setItem: (k, v) => localStore.set(k, String(v)),
          removeItem: (k) => localStore.delete(k),
        },
        fetch: fakeFetch,
        XMLHttpRequest: FakeXHR,
        FormData: FakeFormData,
        setTimeout: (fn) => {
          const id = nextTimerId++;
          pendingTimers.set(id, fn);
          return id;
        },
        clearTimeout: (id) => { pendingTimers.delete(id); },
        Promise,
        JSON,
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Set,
        parseInt,
        Error,
        RegExp,
        encodeURIComponent,
      });
      vm.runInContext(proofreadCode, ctx, { filename: 'proofread.js' });
      vm.runInContext(code, ctx, { filename: 'admin.js' });
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    },
    flush: () => new Promise((r) => setImmediate(r)),
  };
}

test('selecting a phone gallery video (.MOV or extensionless mp4) shows live upload & preview progress bars', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();

  const videoInput = h.doc.querySelector('input[data-upload="video"]');
  assert.ok(videoInput, 'video file input rendered');
  assert.equal(videoInput.getAttribute('accept'), 'video/*', 'accept="video/*" enables native iOS/Android gallery video picker');
  const groupId = videoInput.getAttribute('data-group-id');
  assert.ok(groupId, 'video input belongs to a category/group card');

  // Simulate selecting an iPhone gallery .MOV video (40 MB)
  let valueClearedCount = 0;
  let currentVal = 'C:\\fakepath\\IMG_4821.MOV';
  Object.defineProperty(videoInput, 'value', {
    get: () => currentVal,
    set: (v) => { currentVal = v; if (v === '') valueClearedCount++; },
  });
  videoInput.files = [{ name: 'IMG_4821.MOV', size: 40 * 1024 * 1024, type: 'video/quicktime' }];

  videoInput.dispatchEvent({ type: 'change', bubbles: true });
  await h.flush();

  // 1. Input value is NOT cleared while XHR is still reading the mobile gallery File blob
  assert.equal(valueClearedCount, 0, 'input.value kept intact while upload is in progress');
  assert.equal(h.xhrs.length, 1, 'XHR upload started immediately');
  assert.equal(h.xhrs[0].sentForm.entries[0].filename, 'IMG_4821.MOV');

  // 2. Both the inline group card progress slot AND sticky savebar show initial preparing state
  const videoSlot = h.doc.querySelector(`[data-upload-slot="group-${groupId}"]`);
  const savebarProgress = h.doc.getElementById('savebar-progress');
  assert.match(videoSlot.textContent, /Uploading video: IMG_4821\.MOV/);
  assert.match(videoSlot.textContent, /Preparing 40\.0 MB/);
  assert.equal(savebarProgress.hidden, false);

  // 3. Emit 50% byte progress -> updates percentage and MB transferred
  h.xhrs[0].upload.emit('progress', { loaded: 20 * 1024 * 1024, total: 40 * 1024 * 1024, lengthComputable: true });
  const bar50 = videoSlot.querySelector('[role="progressbar"]');
  assert.equal(bar50.getAttribute('aria-valuenow'), '48');
  assert.match(videoSlot.textContent, /48% · 20\.0 MB \/ 40\.0 MB/);
  assert.match(savebarProgress.textContent, /48% · 20\.0 MB \/ 40\.0 MB/);

  // 4. Emit upload bytes complete (waiting on R2) -> shows 97% Saving to cloud
  h.xhrs[0].upload.emit('load');
  assert.match(videoSlot.textContent, /97% · Saving to cloud/);

  // 5. Server responds 201 Created -> item appears with preview loading bar, upload slot shows 100%
  h.xhrs[0].status = 201;
  h.xhrs[0].responseText = JSON.stringify({
    key: 'sushmita-ghosh/1-abc-img-4821.mov',
    url: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/1-abc-img-4821.mov',
    kind: 'video',
  });
  h.xhrs[0].emit('load');
  await h.flush();
  await h.flush();

  assert.equal(valueClearedCount, 1, 'input.value reset after upload finishes');
  assert.equal(savebarProgress.hidden, true, 'savebar progress hides once finished');
  assert.match(h.doc.querySelector(`[data-upload-slot="group-${groupId}"]`).textContent, /100% · Save changes to publish/);

  // 6. Newly added video item renders a <video> preview inside .thumb-box.is-loading until metadata loads
  const videoPreview = h.doc.querySelector('.item.video video');
  assert.ok(videoPreview, 'video item rendered with <video> preview');
  const thumbBox = videoPreview.closest('.thumb-box');
  assert.equal(thumbBox.classList.contains('is-loading'), true, 'preview starts in loading state');

  videoPreview.dispatchEvent({ type: 'loadedmetadata', bubbles: false });
  assert.equal(thumbBox.classList.contains('is-loading'), false, 'preview loading bar clears once video metadata loads');
});

test('oversize or extensionless Android gallery files handle errors and MIME fallback visibly in the card', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();

  // 1. Oversize 110 MB video shows persistent inline error right inside the group card
  const videoInput = h.doc.querySelector('input[data-upload="video"]');
  const groupId = videoInput.getAttribute('data-group-id');
  videoInput.files = [{ name: '4k-clip.mp4', size: 110 * 1024 * 1024, type: 'video/mp4' }];
  videoInput.dispatchEvent({ type: 'change', bubbles: true });
  await h.flush();

  const videoSlot = h.doc.querySelector(`[data-upload-slot="group-${groupId}"]`);
  assert.match(videoSlot.textContent, /95 MB or smaller/);
  assert.equal(h.xhrs.length, 0, 'oversize file rejected before network upload');

  // 2. Extensionless Android gallery file ("1000048291", type "video/mp4") infers .mp4 and uploads
  videoInput.files = [{ name: '1000048291', size: 8 * 1024 * 1024, type: 'video/mp4' }];
  videoInput.dispatchEvent({ type: 'change', bubbles: true });
  await h.flush();

  assert.equal(h.xhrs.length, 1);
  assert.equal(h.xhrs[0].sentForm.entries[0].filename, '1000048291.mp4');
});

test('redesigned admin groups videos first followed by photos per category/title and persists group order on save', async () => {
  const h = await createAdminUploadHarness({
    photos: [
      { file: 'bridal-1.jpg', title: 'Bridal Look 1', category: 'Bridal', width: 1080, height: 1620 },
      { file: 'trad-1.jpg', title: 'Traditional Look', category: 'Traditional', width: 1600, height: 1067 },
    ],
    videos: [
      { file: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/1-bridal.mov', title: 'Bridal', category: '', width: 1080, height: 1920 },
      { file: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/2-meesho.mp4', title: 'Meesho', category: '', width: 720, height: 1280 },
    ],
  });
  await h.boot();

  // 1. Existing R2 profile automatically organises into Bridal, Meesho, Traditional group cards
  const groupCards = h.doc.querySelectorAll('.group-card');
  assert.equal(groupCards.length, 3);
  const groupTitles = groupCards.map((c) => c.querySelector('[data-group-title]').value);
  assert.deepEqual(groupTitles, ['Bridal', 'Meesho', 'Traditional']);
  // Traditional contains only landscape items (1600x1067) -> marked data-landscape-group="1" (not resized to portrait)
  assert.equal(groupCards[0].getAttribute('data-landscape-group'), null);
  assert.equal(groupCards[1].getAttribute('data-landscape-group'), null);
  assert.equal(groupCards[2].getAttribute('data-landscape-group'), '1');

  // 2. Inside Bridal group card, video appears first (#1 · Video) followed by photo (#2 · Photo)
  const bridalCards = groupCards[0].querySelectorAll('.admin-media-card');
  assert.equal(bridalCards.length, 2);
  assert.equal(bridalCards[0].classList.contains('video'), true);
  assert.match(bridalCards[0].textContent, /#1 · Video \(shown first\)/);
  assert.equal(bridalCards[1].classList.contains('photo'), true);
  assert.match(bridalCards[1].textContent, /#2 · Photo/);

  // 3. Categories can be collapsed/expanded individually and via "Collapse all" / "Expand all"
  const bridalToggle = groupCards[0].querySelector('.group-collapse-btn');
  const bridalBody = groupCards[0].querySelector('.group-card-body');
  assert.equal(bridalBody.hidden, false);
  assert.equal(bridalToggle.getAttribute('aria-expanded'), 'true');

  bridalToggle.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(bridalBody.hidden, true);
  assert.equal(groupCards[0].classList.contains('is-collapsed'), true);
  assert.equal(bridalToggle.getAttribute('aria-expanded'), 'false');

  const toggleAllBtn = h.doc.querySelector('[data-action="toggle-all-groups"]');
  assert.ok(toggleAllBtn);
  assert.equal(toggleAllBtn.textContent, 'Collapse all');
  toggleAllBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(groupCards.every((c) => c.querySelector('.group-card-body').hidden), true);
  assert.equal(toggleAllBtn.textContent, 'Expand all');

  toggleAllBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(groupCards.every((c) => !c.querySelector('.group-card-body').hidden), true);

  // 3b. Every top-level admin section (Profile & About, Measurements, Contact, Cover photos, Portfolio groups)
  // can be collapsed/expanded individually and via "Collapse all sections" / "Expand all sections"
  const sectionCards = h.doc.querySelectorAll('.section-card');
  assert.deepEqual(
    sectionCards.map((s) => s.getAttribute('data-section-card')),
    ['profile', 'measurements', 'contact', 'cover', 'portfolio'],
  );
  const profileSection = sectionCards[0];
  const profileToggle = profileSection.querySelector('.section-collapse-btn');
  const profileBody = profileSection.querySelector('.section-card-body');
  assert.equal(profileBody.hidden, false);
  profileToggle.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(profileBody.hidden, true);
  assert.equal(profileSection.classList.contains('is-collapsed'), true);
  assert.equal(profileToggle.getAttribute('aria-expanded'), 'false');

  const toggleAllSectionsBtn = h.doc.querySelector('[data-action="toggle-all-sections"]');
  assert.ok(toggleAllSectionsBtn);
  assert.equal(toggleAllSectionsBtn.textContent, 'Collapse all sections');
  toggleAllSectionsBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(sectionCards.every((s) => s.querySelector('.section-card-body').hidden), true);
  assert.equal(toggleAllSectionsBtn.textContent, 'Expand all sections');

  // Clicking "Add row" inside collapsed Measurements auto-expands Measurements
  const addStatBtn = h.doc.querySelector('[data-action="add-stat"]');
  addStatBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(h.doc.querySelector('[data-section-card="measurements"] .section-card-body').hidden, false);

  // Collapse all (since Measurements is open) -> then Expand all sections restores full visibility
  h.doc.querySelector('[data-action="toggle-all-sections"]').dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(h.doc.querySelector('[data-action="toggle-all-sections"]').textContent, 'Expand all sections');
  h.doc.querySelector('[data-action="toggle-all-sections"]').dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(h.doc.querySelectorAll('.section-card').every((s) => !s.querySelector('.section-card-body').hidden), true);

  // 4. Add a new group, rename it to "Editorial", and save -> persists groups & clean items without _gid/_groups
  const addGroupBtn = h.doc.querySelector('[data-action="add-group"]');
  addGroupBtn.dispatchEvent({ type: 'click', bubbles: true });
  const newGroupInput = h.doc.querySelector('[data-group-title="3"]');
  assert.ok(newGroupInput);
  newGroupInput.value = 'Editorial';
  newGroupInput.dispatchEvent({ type: 'input', bubbles: true });

  const saveBtn = h.doc.getElementById('save');
  saveBtn.dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  await h.flush();

  assert.equal(h.savedPayloads.length, 1);
  const savedModel = h.savedPayloads[0].model;
  assert.deepEqual(savedModel.groups, ['Bridal', 'Meesho', 'Traditional', 'Editorial']);
  assert.equal('_groups' in savedModel, false);
  assert.equal(savedModel.videos.some((v) => '_gid' in v), false);
  assert.equal(savedModel.photos.some((p) => '_gid' in p), false);
  assert.equal(savedModel.videos[0].category, 'Bridal');
});

test('admin panel moves measurement attributes up/down and adds newly uploaded photos/videos first', async () => {
  const h = await createAdminUploadHarness({
    stats: [
      { label: 'Height', value: '5′4″' },
      { label: 'Eyes', value: 'Black' },
      { label: 'Hair', value: 'Black' },
    ],
    cover: [
      { file: 'cover-old.jpg', alt: 'Old cover' },
    ],
    photos: [
      { file: 'bridal-old.jpg', title: 'Old Bridal Photo', category: 'Bridal' },
    ],
    videos: [
      { file: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/old-bridal.mp4', title: 'Old Bridal Video', category: 'Bridal' },
    ],
  });
  await h.boot();

  // 1. Measurements render compact rows with up/down reorder buttons (top row ↑ disabled, bottom row ↓ disabled)
  let statRows = h.doc.querySelectorAll('.stat-row');
  assert.equal(statRows.length, 3);
  assert.equal(statRows[0].querySelector('[data-dir="-1"]').disabled, true);
  assert.equal(statRows[2].querySelector('[data-dir="1"]').disabled, true);

  // Move "Hair" (row 2) up to row 1, then move "Height" (row 0) down to row 1
  statRows[2].querySelector('[data-dir="-1"]').dispatchEvent({ type: 'click', bubbles: true });
  statRows = h.doc.querySelectorAll('.stat-row');
  assert.deepEqual(
    statRows.map((r) => r.querySelector('[data-key="label"]').value),
    ['Height', 'Hair', 'Eyes'],
  );

  statRows[0].querySelector('[data-dir="1"]').dispatchEvent({ type: 'click', bubbles: true });
  statRows = h.doc.querySelectorAll('.stat-row');
  assert.deepEqual(
    statRows.map((r) => r.querySelector('[data-key="label"]').value),
    ['Hair', 'Height', 'Eyes'],
  );

  // 2. Upload a new cover photo -> inserted FIRST ahead of 'cover-old.jpg'
  const coverInput = h.doc.querySelector('input[data-upload="cover"]');
  coverInput.files = [{ name: 'new-hero.jpg', size: 500_000, type: 'image/jpeg' }];
  coverInput.dispatchEvent({ type: 'change', bubbles: true });
  await h.flush();
  h.xhrs[0].status = 201;
  h.xhrs[0].responseText = JSON.stringify({
    key: 'sushmita-ghosh/1-new-hero.jpg',
    url: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/1-new-hero.jpg',
    kind: 'image',
  });
  h.xhrs[0].emit('load');
  await h.flush();
  await h.flush();

  // 3. Upload 2 new portfolio photos in one batch -> added FIRST in order ahead of 'bridal-old.jpg'
  const photoInput = h.doc.querySelector('input[data-upload="photo"]');
  photoInput.files = [
    { name: 'fresh-first.jpg', size: 400_000, type: 'image/jpeg' },
    { name: 'fresh-second.jpg', size: 410_000, type: 'image/jpeg' },
  ];
  photoInput.dispatchEvent({ type: 'change', bubbles: true });
  await h.flush();
  h.xhrs[1].status = 201;
  h.xhrs[1].responseText = JSON.stringify({
    key: 'sushmita-ghosh/2-fresh-first.jpg',
    url: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/2-fresh-first.jpg',
    kind: 'image',
  });
  h.xhrs[1].emit('load');
  await h.flush();
  await h.flush();
  h.xhrs[2].status = 201;
  h.xhrs[2].responseText = JSON.stringify({
    key: 'sushmita-ghosh/3-fresh-second.jpg',
    url: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/3-fresh-second.jpg',
    kind: 'image',
  });
  h.xhrs[2].emit('load');
  await h.flush();
  await h.flush();

  // 4. Upload a new portfolio video -> added FIRST (#1 · Video) ahead of 'old-bridal.mp4'
  const videoInput = h.doc.querySelector('input[data-upload="video"]');
  videoInput.files = [{ name: 'new-reel.mp4', size: 2_000_000, type: 'video/mp4' }];
  videoInput.dispatchEvent({ type: 'change', bubbles: true });
  await h.flush();
  h.xhrs[3].status = 201;
  h.xhrs[3].responseText = JSON.stringify({
    key: 'sushmita-ghosh/4-new-reel.mp4',
    url: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/4-new-reel.mp4',
    kind: 'video',
  });
  h.xhrs[3].emit('load');
  await h.flush();
  await h.flush();

  // Save and verify persisted order of stats, cover, videos, and photos!
  h.doc.getElementById('save').dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  await h.flush();

  assert.equal(h.savedPayloads.length, 1);
  const saved = h.savedPayloads[0].model;
  assert.deepEqual(saved.stats.map((s) => s.label), ['Hair', 'Height', 'Eyes']);
  assert.deepEqual(saved.cover.map((c) => c.file), [
    'https://modelportfolio.pages.dev/media/sushmita-ghosh/1-new-hero.jpg',
    'cover-old.jpg',
  ]);
  assert.deepEqual(saved.videos.map((v) => v.file), [
    'https://modelportfolio.pages.dev/media/sushmita-ghosh/4-new-reel.mp4',
    'https://modelportfolio.pages.dev/media/sushmita-ghosh/old-bridal.mp4',
  ]);
  assert.deepEqual(saved.photos.map((p) => p.file), [
    'https://modelportfolio.pages.dev/media/sushmita-ghosh/2-fresh-first.jpg',
    'https://modelportfolio.pages.dev/media/sushmita-ghosh/3-fresh-second.jpg',
    'bridal-old.jpg',
  ]);
});

test('all admin fields enable spell & grammar check, flag real errors, preserve rich-text formatting on 1-tap fix, and support Ignore/Toggle', async () => {
  // 1. Clean profile produces 0 false positives and marks all 26 field types with spellcheck + grammar attributes
  const adminHtml = await fs.readFile(path.join(root, 'site', 'admin', 'index.html'), 'utf8');
  assert.match(adminHtml, /<script src="proofread\.js" defer><\/script>/);
  assert.match(adminHtml, /id="token"[^>]*spellcheck="false"/);

  const cleanHarness = await createAdminUploadHarness({
    tagline: 'Editorial & Bridal Model',
    bio: [
      'Sushmita is a photogenic and versatile model with a calm, expressive presence in front of the camera.',
      'She works across editorial, runway, beauty and commercial campaigns in Kolkata and Mumbai.',
    ],
    stats: [
      { label: 'Height', value: '5′4″ · 163 cm' },
      { label: 'Languages', value: 'English · Bengali · Hindi' },
    ],
    seo: { description: 'Sushmita Ghosh – portfolio, videos and bookings.' },
    cover: [{ file: 'cover.jpg', alt: 'Bridal portrait in a red and gold Bengali wedding saree with shola crown and gold jewellery' }],
    photos: [{ file: 'p1.jpg', title: 'Red silk saree', category: 'Bridal', year: '2026', alt: 'Bride holding marigold flowers' }],
    videos: [{ file: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/v1.mp4', title: 'Bridal reel', category: 'Bridal', description: 'Behind the scenes on set' }],
    contact: {
      email: 'sushmitaghosh0099@gmail.com',
      phone: '+91 86977 71768',
      whatsapp: '+91 86977 71768',
      instagram: 'https://instagram.com/sushmita',
    },
  });
  await cleanHarness.boot();

  const allTargets = cleanHarness.doc.querySelectorAll('[data-proofread-target]');
  assert.equal(allTargets.length, 28, 'all 28 rendered text fields across every admin section are wired');
  for (const el of allTargets) {
    assert.equal(el.getAttribute('spellcheck'), 'true');
    assert.equal(el.getAttribute('lang'), 'en');
    assert.equal(el.getAttribute('data-gramm'), 'true');
  }
  assert.equal(cleanHarness.doc.querySelectorAll('.proofread-item').length, 0, 'zero false positives on clean profile');
  assert.match(cleanHarness.doc.querySelector('[data-proofread-summary]').textContent, /Spell & grammar OK/);

  // 2. Profile with spelling + grammar mistakes across rich-text boxes, stats, group title, contact, and media fields
  const h = await createAdminUploadHarness({
    bio: ['she work across a orange saree.'],
    richText: {
      contactHeading: [
        { text: 'Lets create something ' },
        { text: 'beutiful', italic: true, color: '#c9a77d' },
        { text: ' together.' },
      ],
    },
    texts: {
      contactHeading: 'Lets create something beutiful together.',
    },
    stats: [{ label: 'Measurments', value: 'Englsh · Xyloform' }],
    cover: [{ file: 'cover.jpg', alt: 'Bride in a expressive pose' }],
    photos: [{ file: 'p1.jpg', title: 'Traditonal look', category: 'Bridel', year: '202O', alt: 'i dont mind the the rain' }],
    videos: [{ file: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/v1.mp4', title: 'Runway highlight', category: 'Bridel', description: 'Photograhpy reel' }],
    contact: {
      email: 'sushmita@gmial.com',
      phone: '+91 86977 71768',
      whatsapp: '+91 86977 71768',
      instagram: 'htps://instgram.com/sushmita',
    },
  });
  await h.boot();

  const summaryBefore = h.doc.querySelector('[data-proofread-summary]').textContent;
  assert.match(summaryBefore, /suggestions · Review/);

  const applyAllFixesInSlot = (targetId) => {
    for (let guard = 0; guard < 8; guard++) {
      const slot = h.doc.querySelector(`[data-proofread-slot="${targetId}"]`);
      const fixBtn = slot && slot.querySelector('.proofread-fix-btn');
      if (!fixBtn) break;
      fixBtn.dispatchEvent({ type: 'click', bubbles: true });
    }
  };

  // Fix rich-text contactHeading ("Lets" -> "Let's", "beutiful" -> "beautiful") while preserving italic + colour run!
  applyAllFixesInSlot('rich:contactHeading');
  // Fix rich-text bio ("she work" -> "She works", "a orange" -> "an orange")
  applyAllFixesInSlot('rich:bio');
  // Fix measurement label ("Measurments" -> "Measurements") & value ("Englsh" -> "English", then Ignore custom word "Xyloform")
  applyAllFixesInSlot('list:stats:0:label');
  const valSlot = h.doc.querySelector('[data-proofread-slot="list:stats:0:value"]');
  valSlot.querySelector('.proofread-fix-btn').dispatchEvent({ type: 'click', bubbles: true });
  const ignoreBtn = h.doc.querySelector('[data-proofread-slot="list:stats:0:value"]').querySelector('.proofread-ignore-btn');
  assert.ok(ignoreBtn, 'uncommon word offers 1-click Ignore button');
  ignoreBtn.dispatchEvent({ type: 'click', bubbles: true });

  // Fix cover alt, group title ("Bridel" -> "Bridal"), video description, photo title/year/alt, email, and Instagram URL
  applyAllFixesInSlot('list:cover:0:alt');
  applyAllFixesInSlot('group:0:title');
  applyAllFixesInSlot('list:videos:0:description');
  applyAllFixesInSlot('list:photos:0:title');
  applyAllFixesInSlot('list:photos:0:year');
  applyAllFixesInSlot('list:photos:0:alt');
  applyAllFixesInSlot('field:contact.email');
  applyAllFixesInSlot('field:contact.instagram');

  assert.equal(h.doc.querySelectorAll('.proofread-item').length, 0, 'all spelling and grammar issues resolved');
  assert.match(h.doc.querySelector('[data-proofread-summary]').textContent, /Spell & grammar OK/);

  // Live typing check: typing a typo into tagline triggers debounced live spell check
  const taglineInput = h.doc.querySelector('input[data-field="tagline"]');
  taglineInput.value = 'Versitile model';
  taglineInput.dispatchEvent({ type: 'input', bubbles: true });
  h.runTimers();
  assert.equal(h.doc.querySelectorAll('.proofread-item').length, 1);
  applyAllFixesInSlot('field:tagline');
  assert.equal(taglineInput.value, 'Versatile model');

  // Toggle Spell & grammar Off -> sets spellcheck="false", then back On -> restores spellcheck="true"
  const toggleBtn = h.doc.querySelector('[data-action="toggle-proofread"]');
  toggleBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(taglineInput.getAttribute('spellcheck'), 'false');
  toggleBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(taglineInput.getAttribute('spellcheck'), 'true');

  // Save and verify every corrected field + preserved inline formatting on contactHeading!
  h.doc.getElementById('save').dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  await h.flush();

  assert.equal(h.savedPayloads.length, 1);
  const saved = h.savedPayloads[0].model;
  assert.equal(saved.tagline, 'Versatile model');
  assert.deepEqual(saved.bio, ['She works across an orange saree.']);
  assert.equal(saved.texts.contactHeading, "Let's create something beautiful together.");
  assert.deepEqual(saved.richText.contactHeading, [
    { text: "Let's create something " },
    { text: 'beautiful', italic: true, color: '#c9a77d' },
    { text: ' together.' },
  ]);
  assert.deepEqual(saved.stats[0], { label: 'Measurements', value: 'English · Xyloform' });
  assert.equal(saved.cover[0].alt, 'Bride in an expressive pose');
  assert.deepEqual(saved.groups, ['Bridal']);
  assert.equal(saved.videos[0].category, 'Bridal');
  assert.equal(saved.videos[0].description, 'Photography reel');
  assert.equal(saved.photos[0].category, 'Bridal');
  assert.equal(saved.photos[0].title, 'Traditional look');
  assert.equal(saved.photos[0].year, '2020');
  assert.equal(saved.photos[0].alt, "I don't mind the rain");
  assert.equal(saved.contact.email, 'sushmita@gmail.com');
  assert.equal(saved.contact.instagram, 'https://instagram.com/sushmita');
});

test('save button shows green tick popup on success and red cross popup with details on error', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();

  const saveBtn = h.doc.getElementById('save');

  // 1. Trigger a failed save -> Red Cross popup appears with clear title & bullet list of validation errors
  h.failNextSave({
    status: 400,
    error: '"cover" needs at least one photo.',
    errors: [
      '"cover" needs at least one photo.',
      '"phone" must have at least 8 digits.',
    ],
  });

  saveBtn.dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  await h.flush();

  const popup = h.doc.getElementById('save-popup');
  assert.ok(popup, '#save-popup exists');
  assert.equal(popup.hidden, false, 'error popup is visible');
  assert.ok(popup.querySelector('[data-save-popup-kind="error"]'), 'renders error popup card');
  const redCrossIcon = popup.querySelector('[data-save-popup-icon="error"]');
  assert.ok(redCrossIcon, 'renders red cross icon container');
  assert.ok(redCrossIcon.querySelector('line'), 'renders SVG cross lines');
  assert.equal(popup.querySelector('#save-popup-title').textContent, 'Could not save changes');
  const errorItems = popup.querySelectorAll('.save-popup-errors li').map((li) => li.textContent);
  assert.deepEqual(errorItems, [
    '"cover" needs at least one photo.',
    '"phone" must have at least 8 digits.',
  ]);
  assert.equal(saveBtn.textContent, 'Save changes', 'restores Save changes label after error');

  // Error popup stays open across timers until explicitly closed by the user
  h.runTimers();
  assert.equal(popup.hidden, false, 'error popup does not auto-dismiss');

  popup.querySelector('[data-save-popup-close]').dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(popup.hidden, true, 'clicking Close dismisses error popup');

  // 2. Trigger a successful save -> Green Tick popup appears with confirmation message
  saveBtn.dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  await h.flush();

  assert.equal(popup.hidden, false, 'success popup is visible');
  assert.ok(popup.querySelector('[data-save-popup-kind="success"]'), 'renders success popup card');
  const greenTickIcon = popup.querySelector('[data-save-popup-icon="success"]');
  assert.ok(greenTickIcon, 'renders green tick icon container');
  assert.ok(greenTickIcon.querySelector('polyline'), 'renders SVG tick checkmark');
  assert.equal(popup.querySelector('#save-popup-title').textContent, 'Changes saved successfully');
  assert.match(popup.querySelector('#save-popup-desc').textContent, /Sushmita Ghosh/);
  assert.match(popup.querySelector('#save-popup-desc').textContent, /live on the website/);

  // Auto-closes after timer (or when clicking Done)
  h.runTimers();
  assert.equal(popup.hidden, true, 'success popup auto-dismisses cleanly');
});



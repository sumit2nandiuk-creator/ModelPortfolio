import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminJsPath = path.join(root, 'site', 'admin', 'admin.js');

// Lightweight DOM + XHR harness for site/admin/admin.js upload & preview progress flows.
function createAdminUploadHarness(modelOverrides = {}, modelSlugs = ['sushmita-ghosh'], localProfileStorage = new Map()) {
  const xhrs = [];
  const savedPayloads = [];
  const thumbnailUploads = [];
  const profileReads = [];
  const profileActions = [];
  let putFailure = null;
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
      uiHistory.push(String(v));
      this.childNodes = v === '' ? [] : [{ nodeType: 3, nodeValue: String(v), parentElement: this }];
    }

    get innerHTML() { return this._rawHtml || ''; }
    set innerHTML(html) {
      uiHistory.push(String(html));
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

  const uiHistory = [];
  const canvases = [];
  const doc = {
    createElement(tag) {
      if (String(tag).toLowerCase() === 'canvas') {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }),
          toBlob(callback, type) { callback(new Blob(['thumbnail'], { type })); },
        };
        canvases.push(canvas);
        return canvas;
      }
      return new MiniElement(tag, doc);
    },
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
      <div id="generation-progress" hidden></div><button id="generate-thumbnails">Generate Thumbnails</button>
      <a id="view-site"></a>
      <button id="archive-profile"></button>
      <button id="delete-profile"></button>
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
    const pathname = new URL(url, 'https://modelportfolio.pages.dev').pathname;
    if (pathname === '/api/models') {
      return {
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ models: modelSlugs, archived: [] }),
      };
    }
    const modelMatch = /^\/api\/models\/([^/]+)$/.exec(pathname);
    if (modelMatch && (!opts.method || opts.method === 'GET')) {
      const slug = decodeURIComponent(modelMatch[1]);
      profileReads.push(slug);
      const model = JSON.parse(JSON.stringify(fakeModel));
      model.slug = slug;
      return {
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sha: 'v-1', model: model }),
      };
    }
    if (modelMatch && opts.method === 'DELETE') {
      const body = JSON.parse(opts.body);
      profileActions.push({ slug: decodeURIComponent(modelMatch[1]), action: body.action });
      return {
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ state: body.action === 'permanent' ? 'deleted' : body.action === 'archive' ? 'archived' : 'active' }),
      };
    }
    if (url.endsWith('/api/models/sushmita-ghosh/media') && opts.method === 'POST') {
      thumbnailUploads.push(opts.body);
      const file = opts.body.entries.find((entry) => entry.name === 'file');
      const isPreview = String(file?.filename || '').startsWith('preview-');
      return {
        status: 201,
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ url: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/' + (String(file?.filename || '').startsWith('variant-') ? file.filename : isPreview ? 'preview-cover.webp' : 'thumb-cover.webp') }),
      };
    }
    if (url.endsWith('/api/models/sushmita-ghosh') && opts.method === 'PUT') {
      const parsed = JSON.parse(opts.body);
      if (putFailure) {
        const fail = putFailure;
        putFailure = null;
        return {
          status: fail.status,
          ok: false,
          headers: { get: () => 'application/json' },
          json: async () => ({ error: fail.error, ...(fail.errors ? { errors: fail.errors } : {}) }),
        };
      }
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

  class FakeImage {
    constructor() { this.naturalWidth = 800; this.naturalHeight = 1200; this.width = 800; this.height = 1200; }
    set src(value) { this._src = value; if (this.onload) this.onload(); }
    get src() { return this._src || ''; }
  }

  const win = {
    ADMIN_CONFIG: { apiBase: '' },
    location: { href: 'https://modelportfolio.pages.dev/admin/' },
    URL: {
      createObjectURL: (file) => {
        if (file && String(file.type || '').indexOf('video/') === 0) throw new Error('Synthetic video file has no bytes');
        return 'blob:test-image';
      },
      revokeObjectURL() {},
    },
    Image: FakeImage,
    Worker: class {
      postMessage() { queueMicrotask(() => this.onmessage({ data: { buffer: new Uint8Array([0, 1, 2]).buffer } })); }
      terminate() {}
    },
    addEventListener() {},
    confirm: () => true,
  };

  return {
    doc,
    xhrs,
    savedPayloads,
    thumbnailUploads,
    profileReads,
    profileActions,
    localProfileStorage,
    canvases,
    uiHistory,
    failNextSave(error, { status = 409, errors } = {}) {
      putFailure = { error, status, errors };
    },
    async boot() {
      const code = await fs.readFile(adminJsPath, 'utf8');
      const ctx = vm.createContext({
        window: win,
        document: doc,
        sessionStorage: {
          getItem: (k) => storage.get(k) ?? null,
          setItem: (k, v) => storage.set(k, String(v)),
          removeItem: (k) => storage.delete(k),
        },
        localStorage: {
          getItem: (k) => localProfileStorage.get(k) ?? null,
          setItem: (k, v) => localProfileStorage.set(k, String(v)),
          removeItem: (k) => localProfileStorage.delete(k),
        },
        fetch: fakeFetch,
        XMLHttpRequest: FakeXHR,
        FormData: FakeFormData,
        setTimeout: () => 1,
        clearTimeout: () => {},
        Promise,
        JSON,
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Error,
        RegExp,
        encodeURIComponent,
        URL,
        Blob,
      });
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
  for (let i = 0; i < 8; i++) await h.flush();

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
  assert.equal(groupCards[0].querySelector('[data-group-title]').getAttribute('data-styled-slot'), 'aboutLabel');
  // Traditional contains only landscape items (1600x1067) -> marked data-landscape-group="1" (not resized to portrait)
  assert.equal(groupCards[0].getAttribute('data-landscape-group'), null);
  assert.equal(groupCards[1].getAttribute('data-landscape-group'), null);
  assert.equal(groupCards[2].getAttribute('data-landscape-group'), '1');

  // 2. Inside Bridal group card, video appears first (#1 · Video) followed by photo (#2 · Photo)
  const bridalCards = groupCards[0].querySelectorAll('.admin-media-card');
  assert.equal(bridalCards.length, 2);
  assert.equal(bridalCards[0].classList.contains('video'), true);
  assert.match(bridalCards[0].textContent, /#1 · Video/);
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
  assert.equal(toggleAllBtn.getAttribute('aria-label'), 'Collapse all categories');
  toggleAllBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(groupCards.every((c) => c.querySelector('.group-card-body').hidden), true);
  assert.equal(toggleAllBtn.getAttribute('aria-label'), 'Expand all categories');

  toggleAllBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(groupCards.every((c) => !c.querySelector('.group-card-body').hidden), true);

  // 3b. Every top-level admin section (Profile & About, Measurements, Contact, Cover photos, Portfolio groups)
  // can be collapsed/expanded individually and via "Collapse all sections" / "Expand all sections"
  const sectionCards = h.doc.querySelectorAll('.section-card');
  assert.deepEqual(
    sectionCards.map((s) => s.getAttribute('data-section-card')),
    ['profile', 'measurements', 'contact', 'cover', 'portfolio'],
  );
  const portfolioSection = h.doc.querySelector('[data-section-card="portfolio"]');
  assert.ok(portfolioSection);
  assert.ok(portfolioSection.querySelector('[data-composer="portfolioLabel"]'), 'portfolio section has Section label composer');
  assert.equal(portfolioSection.querySelector('[data-composer="portfolioHeading"]'), null, 'portfolio section heading is removed from admin panel');
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
  assert.equal(toggleAllSectionsBtn.getAttribute('aria-label'), 'Collapse all sections');
  toggleAllSectionsBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(sectionCards.every((s) => s.querySelector('.section-card-body').hidden), true);
  assert.equal(toggleAllSectionsBtn.getAttribute('aria-label'), 'Expand all sections');

  // Clicking "Add row" inside collapsed Measurements auto-expands Measurements
  const addStatBtn = h.doc.querySelector('[data-action="add-stat"]');
  addStatBtn.dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(h.doc.querySelector('[data-section-card="measurements"] .section-card-body').hidden, false);

  // Collapse all (since Measurements is open) -> then Expand all sections restores full visibility
  h.doc.querySelector('[data-action="toggle-all-sections"]').dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(h.doc.querySelector('[data-action="toggle-all-sections"]').getAttribute('aria-label'), 'Expand all sections');
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
  assert.equal(statRows[0].querySelector('[data-key="label"]').getAttribute('data-styled-slot'), 'aboutLabel');

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
  for (let i = 0; i < 8; i++) await h.flush();

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
  assert.ok(saved.cover[0].thumbnail, 'new slideshow cover receives a normal thumbnail automatically');
  assert.ok(saved.cover[0].preview, 'new slideshow cover receives a tiny preview automatically');
  assert.equal(h.thumbnailUploads.length, 18, 'three photos each upload two previews and four responsive variants without upscaling');
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

test('refreshing the admin reopens the last selected profile', async () => {
  const persisted = new Map([['admin.last-profile', 'profile-b']]);
  const first = await createAdminUploadHarness({}, ['profile-a', 'profile-b'], persisted);
  await first.boot();
  assert.deepEqual(first.profileReads, ['profile-b']);

  first.doc.getElementById('model-picker').value = 'profile-a';
  first.doc.getElementById('model-picker').dispatchEvent({ type: 'change', bubbles: true });
  for (let i = 0; i < 4; i++) await first.flush();
  assert.equal(persisted.get('admin.last-profile'), 'profile-a');

  const refreshed = await createAdminUploadHarness({}, ['profile-a', 'profile-b'], persisted);
  await refreshed.boot();
  assert.deepEqual(refreshed.profileReads, ['profile-a']);
});

test('profiles can be archived, restored, or permanently deleted from the admin', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();
  const archiveBtn = h.doc.getElementById('archive-profile');
  const deleteBtn = h.doc.getElementById('delete-profile');

  archiveBtn.dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  assert.equal(h.profileActions[0].action, 'archive');
  assert.equal(archiveBtn.getAttribute('aria-label'), 'Restore profile');
  assert.match(h.doc.getElementById('status').textContent, /hidden from the website/);

  archiveBtn.dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  assert.equal(h.profileActions[1].action, 'restore');
  assert.equal(archiveBtn.getAttribute('aria-label'), 'Temporarily hide profile');

  deleteBtn.dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  assert.equal(h.profileActions[2].action, 'permanent');
  assert.equal(deleteBtn.disabled, true, 'permanent delete is unavailable after the profile is removed');
  assert.equal(h.localProfileStorage.has('admin.last-profile'), false);
});

test('Generate Thumbnails downsizes missing model images, uploads them to R2 and saves their references', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();

  h.doc.getElementById('generate-thumbnails').dispatchEvent({ type: 'click', bubbles: true });
  for (let i = 0; i < 8; i++) await h.flush();

  assert.equal(h.thumbnailUploads.length, 6, 'two previews plus WebP and AVIF variants at 480px and native 800px');
  assert.ok(h.canvases.some((canvas) => canvas.width === 43 && canvas.height === 64), 'tiny preview is resized to at most 64 pixels on its longest edge');
  assert.ok(h.canvases.some((canvas) => canvas.width === 240 && canvas.height === 360), 'normal thumbnail is resized to at most 360 pixels on its longest edge');
  assert.equal(h.savedPayloads.length, 1, 'profile is saved after thumbnail upload');
  assert.equal(h.savedPayloads[0].model.cover[0].variants.length, 4);
  assert.deepEqual(h.savedPayloads[0].model.cover[0].variants.map(v => v.width), [480, 480, 800, 800]);
  assert.deepEqual(h.savedPayloads[0].model.cover[0].variants.map(v => v.format), ['webp', 'avif', 'webp', 'avif']);
  assert.equal(
    h.savedPayloads[0].model.cover[0].thumbnail,
    'https://modelportfolio.pages.dev/media/sushmita-ghosh/thumb-cover.webp',
  );
  assert.equal(
    h.savedPayloads[0].model.cover[0].preview,
    'https://modelportfolio.pages.dev/media/sushmita-ghosh/preview-cover.webp',
  );

  h.doc.getElementById('generate-thumbnails').dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  assert.equal(h.thumbnailUploads.length, 6, 'a second run skips completed previews and variants');
});

test('Generate Thumbnails backfills only the tiny preview when a normal cover thumbnail already exists', async () => {
  const h = await createAdminUploadHarness({
    cover: [{ file: 'cover.jpg', thumbnail: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/existing-normal.webp', alt: 'Cover' }],
  });
  await h.boot();
  h.doc.getElementById('generate-thumbnails').dispatchEvent({ type: 'click', bubbles: true });
  for (let i = 0; i < 8; i++) await h.flush();

  assert.equal(h.thumbnailUploads.length, 5, 'missing preview and four responsive variants are generated');
  assert.equal(h.thumbnailUploads[0].entries[0].filename.startsWith('preview-'), true);
  assert.equal(h.savedPayloads[0].model.cover[0].thumbnail, 'https://modelportfolio.pages.dev/media/sushmita-ghosh/existing-normal.webp');
  assert.equal(h.savedPayloads[0].model.cover[0].preview, 'https://modelportfolio.pages.dev/media/sushmita-ghosh/preview-cover.webp');
});

test('a batch of four cover slideshow photos receives a thumbnail per image before publishing', async () => {
  const h = await createAdminUploadHarness({ cover: [] });
  await h.boot();
  const input = h.doc.querySelector('input[data-upload="cover"]');
  assert.ok(input, 'cover upload input exists');
  input.files = [1, 2, 3, 4].map((n) => ({ name: 'hero-' + n + '.jpg', size: 1000 + n, type: 'image/jpeg' }));
  input.dispatchEvent({ type: 'change', bubbles: true });

  for (let i = 0; i < 4; i++) {
    for (let wait = 0; wait < 10 && !h.xhrs[i]; wait++) await h.flush();
    const xhr = h.xhrs[i];
    assert.ok(xhr, 'original cover ' + (i + 1) + ' starts uploading');
    xhr.status = 201;
    xhr.responseText = JSON.stringify({
      key: 'sushmita-ghosh/' + (i + 1) + '-hero-' + (i + 1) + '.jpg',
      url: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/' + (i + 1) + '-hero-' + (i + 1) + '.jpg',
      kind: 'image',
    });
    xhr.emit('load');
    for (let wait = 0; wait < 10; wait++) await h.flush();
  }

  assert.equal(h.thumbnailUploads.length, 24, 'every uploaded cover generates two previews and four responsive variants');
  h.doc.getElementById('save').dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  await h.flush();
  assert.equal(h.savedPayloads[0].model.cover.length, 4);
  assert.ok(h.savedPayloads[0].model.cover.every((cover) => cover.thumbnail && cover.preview), 'all four saved cover entries include both thumbnail sizes');
});

test('a newly uploaded portfolio photo gets a thumbnail uploaded and linked automatically', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();

  const input = h.doc.querySelector('input[data-upload="photo"]');
  assert.ok(input, 'photo input exists');
  input.files = [{ name: 'fresh-photo.jpg', size: 4096, type: 'image/jpeg' }];
  input.dispatchEvent({ type: 'change', bubbles: true });
  await h.flush();
  assert.equal(h.xhrs.length, 1, 'original image uploads first');

  h.xhrs[0].status = 201;
  h.xhrs[0].responseText = JSON.stringify({
    key: 'sushmita-ghosh/1-photo.jpg',
    url: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/1-photo.jpg',
    kind: 'image',
  });
  h.xhrs[0].emit('load');
  for (let i = 0; i < 8; i++) await h.flush();

  assert.equal(h.thumbnailUploads.length, 6, 'previews and responsive variants are uploaded to R2 automatically');
  assert.ok(h.uiHistory.some(text => text.includes('Generating and uploading preview thumbnails')));
  assert.ok(h.uiHistory.some(text => text.includes('Encoding 480px AVIF')));
  assert.ok(h.uiHistory.some(text => text.includes('Uploading 800px WEBP')));
  assert.equal(h.thumbnailUploads.filter(form => form.entries[0].filename.endsWith('.avif')).length, 2);
  h.doc.getElementById('save').dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  await h.flush();
  assert.equal(
    h.savedPayloads[0].model.photos[0].thumbnail,
    'https://modelportfolio.pages.dev/media/sushmita-ghosh/thumb-cover.webp',
    'saved photo references the normal thumbnail URL',
  );
  assert.equal(
    h.savedPayloads[0].model.photos[0].preview,
    'https://modelportfolio.pages.dev/media/sushmita-ghosh/preview-cover.webp',
    'saved photo references the tiny preview URL',
  );
});

test('save success shows a green-tick popup and a success status', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();

  const toastEl = h.doc.getElementById('toast');
  assert.equal(toastEl.hidden, true, 'no popup before saving');

  h.doc.getElementById('save').dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  await h.flush();

  // Exactly one payload reached the API.
  assert.equal(h.savedPayloads.length, 1);

  // Green-tick popup: visible, styled ok, with a tick icon and a clear message.
  assert.equal(toastEl.hidden, false, 'success popup is visible');
  assert.match(toastEl.className, /toast--ok/);
  const okIcon = toastEl.querySelector('.toast-icon');
  assert.ok(okIcon, 'success popup has an icon');
  assert.equal(okIcon.textContent, '✓');
  assert.match(toastEl.querySelector('.toast-text').textContent, /Saved/);

  // The inline status line matches the popup.
  const statusEl = h.doc.getElementById('status');
  assert.match(statusEl.className, /status ok/);
  assert.match(statusEl.textContent, /Saved/);
});

test('save failure shows a red-cross popup and an error status', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();

  const failure = 'This profile changed since you opened it. Reload it, then apply your changes again.';
  h.failNextSave(failure, { status: 409, errors: ['version conflict'] });

  h.doc.getElementById('save').dispatchEvent({ type: 'click', bubbles: true });
  await h.flush();
  await h.flush();

  // Nothing was persisted when the server refused the save.
  assert.equal(h.savedPayloads.length, 0);

  const toastEl = h.doc.getElementById('toast');
  assert.equal(toastEl.hidden, false, 'error popup is visible');
  assert.match(toastEl.className, /toast--error/);
  const errIcon = toastEl.querySelector('.toast-icon');
  assert.ok(errIcon, 'error popup has an icon');
  assert.equal(errIcon.textContent, '✕');
  assert.match(toastEl.querySelector('.toast-text').textContent, /changed since you opened it/);

  const statusEl = h.doc.getElementById('status');
  assert.match(statusEl.className, /status error/);
  assert.match(statusEl.textContent, /changed since you opened it/);
});

test('Generate Thumbnails shows monotonic batch progress through encoding, upload, save and completion', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();
  const panel = h.doc.getElementById('generation-progress');
  h.doc.getElementById('generate-thumbnails').dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(panel.hidden, false, 'bar appears immediately');
  assert.match(panel.innerHTML, /aria-valuenow="0"/);
  for (let i = 0; i < 12; i++) await h.flush();
  const updates = h.uiHistory.filter(text => text.includes('aria-label="Thumbnail and variant generation"'));
  const percentages = updates.map(text => Number(text.match(/aria-valuenow="(\d+)"/)[1]));
  assert.ok(percentages.length > 10, 'progress updates for individual stages');
  assert.ok(percentages.every((value, i) => !i || value >= percentages[i - 1]), 'never moves backwards');
  assert.ok(updates.some(text => text.includes('Media 1 of 1') && text.includes('Encoding 480px AVIF')));
  assert.ok(updates.some(text => text.includes('Uploading 800px WEBP')));
  assert.ok(updates.some(text => text.includes('aria-valuenow="98"') && text.includes('Saving profile')));
  assert.match(panel.innerHTML, /aria-valuenow="100"/);
  assert.match(panel.textContent, /Complete/);
  assert.equal(panel.className, 'generation-progress is-done');
  assert.equal(panel.hidden, false, 'completion survives editor rerender');
});

test('generation progress reports profile save failures without claiming 100 percent saved', async () => {
  const h = await createAdminUploadHarness();
  await h.boot();
  h.failNextSave('Conflict — reload before saving');
  h.doc.getElementById('generate-thumbnails').dispatchEvent({ type: 'click', bubbles: true });
  for (let i = 0; i < 12; i++) await h.flush();
  const panel = h.doc.getElementById('generation-progress');
  assert.equal(panel.className, 'generation-progress is-error');
  assert.match(panel.innerHTML, /aria-valuenow="98"/);
  assert.match(panel.textContent, /profile save failed/);
  assert.equal(h.doc.getElementById('generate-thumbnails').disabled, false, 'action is restored');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

  return {
    doc,
    xhrs,
    savedPayloads,
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
      { file: 'bridal-1.jpg', title: 'Bridal Look 1', category: 'Bridal' },
      { file: 'trad-1.jpg', title: 'Traditional Look', category: 'Traditional' },
    ],
    videos: [
      { file: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/1-bridal.mov', title: 'Bridal', category: '' },
      { file: 'https://modelportfolio.pages.dev/media/sushmita-ghosh/2-meesho.mp4', title: 'Meesho', category: '' },
    ],
  });
  await h.boot();

  // 1. Existing R2 profile automatically organises into Bridal, Meesho, Traditional group cards
  const groupCards = h.doc.querySelectorAll('.group-card');
  assert.equal(groupCards.length, 3);
  const groupTitles = groupCards.map((c) => c.querySelector('[data-group-title]').value);
  assert.deepEqual(groupTitles, ['Bridal', 'Meesho', 'Traditional']);

  // 2. Inside Bridal group card, video appears first (#1 · Video) followed by photo (#2 · Photo)
  const bridalCards = groupCards[0].querySelectorAll('.admin-media-card');
  assert.equal(bridalCards.length, 2);
  assert.equal(bridalCards[0].classList.contains('video'), true);
  assert.match(bridalCards[0].textContent, /#1 · Video \(shown first\)/);
  assert.equal(bridalCards[1].classList.contains('photo'), true);
  assert.match(bridalCards[1].textContent, /#2 · Photo/);

  // 3. Add a new group, rename it to "Editorial", and save -> persists groups & clean items without _gid/_groups
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

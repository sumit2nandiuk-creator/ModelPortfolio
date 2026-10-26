import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('client reporter records frontend exceptions and failed media resources without query strings', async () => {
  const source = await fs.readFile(path.join(root, 'site/assets/error-reporting.js'), 'utf8');
  const listeners = new Map();
  const beacons = [];
  const window = {
    location: { href: 'https://portfolio.test/jane-doe/?campaign=private', pathname: '/jane-doe/' },
    Blob,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
  };
  const navigator = {
    userAgent: 'TestBrowser/1', language: 'en-IN', onLine: false,
    sendBeacon(endpoint, blob) { beacons.push({ endpoint, blob }); return true; },
  };
  vm.runInNewContext(source, { window, navigator, document: { visibilityState: 'visible', readyState: 'complete' }, Blob, URL, Date, String, Number, Object });

  for (const handler of listeners.get('error') || []) {
    handler({ message: 'Script failed', filename: 'https://portfolio.test/assets/app.js?token=secret', lineno: 12, colno: 3, error: new Error('Script failed') });
    handler({ target: { tagName: 'IMG', currentSrc: 'https://portfolio.test/jane-doe/media/cover.jpg?cache=1' } });
  }
  for (const handler of listeners.get('unhandledrejection') || []) {
    handler({ reason: new Error('Promise failed') });
  }

  assert.equal(beacons.length, 3);
  assert.ok(beacons.every((entry) => entry.endpoint === '/api/errors'));
  const payloads = await Promise.all(beacons.map(async (entry) => JSON.parse(await entry.blob.text())));
  assert.equal(payloads[0].details.userAgent, 'TestBrowser/1');
  assert.equal(payloads[0].details.online, false);
  assert.equal(payloads[0].details.visibility, 'visible');
  assert.equal(payloads[0].source, 'frontend-js');
  assert.equal(payloads[0].path, '/jane-doe/');
  assert.equal(payloads[0].details.file, '/assets/app.js');
  assert.equal(payloads[1].source, 'frontend-resource');
  assert.equal(payloads[1].details.resource, '/jane-doe/media/cover.jpg');
  assert.equal(payloads[2].source, 'frontend-promise');
});

test('dashboard copies the complete record as JSON and renders nested diagnostic fields', async () => {
  const source = await fs.readFile(path.join(root, 'site/assets/errors-dashboard.js'), 'utf8');
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.style = {}; this.value = ''; }
    appendChild(el) { this.children.push(el); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    setAttribute() {}
    querySelectorAll() { return this.children; }
  }
  const elements = Object.fromEntries(['token', 'load', 'refresh', 'older', 'records', 'status'].map(id => [id, new Element()]));
  const record = { id: 'error-id', timestamp: '2026-10-26T10:00:00Z', source: 'frontend-js', message: '<unsafe>', path: '/model/', details: { stack: 'full stack', online: false, nested: { code: 42 } } };
  let copied;
  vm.runInNewContext(source, {
    document: { getElementById: id => elements[id], createElement: () => new Element() },
    navigator: { clipboard: { writeText: async text => { copied = text; } } },
    sessionStorage: { getItem: () => 'token', setItem() {} },
    fetch: async () => ({ ok: true, json: async () => ({ errors: [record] }) }),
    setTimeout: fn => fn(),
  });
  await new Promise(resolve => setImmediate(resolve));
  const article = elements.records.children[0];
  const button = article.children[0].children.find(el => el.className === 'secondary copy-error');
  button.listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(copied), record);
  assert.equal(elements.status.textContent, 'Error details copied.');
  assert.equal(article.children[1].textContent, '<unsafe>');
  assert.match(article.children.at(-1).children[1].textContent, /"code": 42/);
});

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
    sendBeacon(endpoint, blob) { beacons.push({ endpoint, blob }); return true; },
  };
  vm.runInNewContext(source, { window, navigator, Blob, URL, Date, String, Number, Object });

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
  assert.equal(payloads[0].source, 'frontend-js');
  assert.equal(payloads[0].path, '/jane-doe/');
  assert.equal(payloads[0].details.file, '/assets/app.js');
  assert.equal(payloads[1].source, 'frontend-resource');
  assert.equal(payloads[1].details.resource, '/jane-doe/media/cover.jpg');
  assert.equal(payloads[2].source, 'frontend-promise');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const lookup = source.slice(source.indexOf('  function findExistingImage('), source.indexOf('  // Preserve actual painted pixels'));
function image({ selected = '', src = '/photo-960.webp', full = '', complete = true, popup = false } = {}) {
  return { currentSrc: selected, src, complete, naturalWidth: complete ? 960 : 0,
    closest: () => popup ? {} : null,
    getAttribute: key => key === 'src' ? src : key === 'data-full-src' ? full : null };
}
function find(images, url) {
  const context = vm.createContext({ URL, window: { location: { href: 'https://portfolio.test/model/' } },
    document: { querySelectorAll: () => images } });
  vm.runInContext(lookup, context);
  return context.findExistingImage(url);
}

test('recognizes the AVIF selected by picture even when src declares WebP', () => {
  const loaded = image({ selected: 'https://portfolio.test/photo-960.avif' });
  assert.equal(find([loaded], '/photo-960.avif'), loaded);
});
test('recognizes the WebP width selected by srcset and normalizes URLs', () => {
  const loaded = image({ selected: 'https://portfolio.test/photo-480.webp' });
  assert.equal(find([loaded], '../photo-480.webp'), loaded);
});
test('prioritizes an actually loaded currentSrc over declared or still-loading matches', () => {
  const declared = image({ src: '/photo.avif' });
  const pending = image({ selected: 'https://portfolio.test/photo.avif', complete: false });
  const loaded = image({ selected: 'https://portfolio.test/photo.avif' });
  assert.equal(find([declared, pending, loaded], '/photo.avif'), loaded);
});
test('keeps different resolutions, formats, prefixes and cache-busting queries distinct', () => {
  const loaded = image({ selected: 'https://portfolio.test/photo-480.avif', src: '/photo-480.webp' });
  for (const url of ['/photo-960.avif', '/photo-480.avif?_r=1', '/photo-480', '/photo-480.avif-extra']) {
    assert.equal(find([loaded], url), null);
  }
});
test('retains legacy src and full-source lookup while excluding popup images', () => {
  const legacy = image({ src: '/thumb.webp', full: '/original.jpg' });
  assert.equal(find([legacy], '/original.jpg'), legacy);
  assert.equal(find([legacy], '/thumb.webp'), legacy);
  assert.equal(find([image({ selected: 'https://portfolio.test/photo.avif', popup: true })], '/photo.avif'), null);
});

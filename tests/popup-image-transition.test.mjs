import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('  function holdPopupImage('), source.indexOf('  function finishPortfolioUpgrade('));

test('popup keeps painted pixels until the new image decodes, then blends and removes the cover', async () => {
  const frames = [];
  const timers = [];
  let ready;
  let writes = 0;
  let canvas;
  const listeners = {};
  const attrs = new Map([['src', 'thumb.webp']]);
  const slide = {
    children: [],
    appendChild(node) { this.children.push(node); node.parentNode = this; },
    removeChild(node) { this.children = this.children.filter(child => child !== node); node.parentNode = null; }
  };
  const img = {
    tagName: 'IMG', complete: true, naturalWidth: 360, naturalHeight: 540, style: {},
    closest: selector => selector === '#lb-stage' ? {} : slide,
    getAttribute: key => attrs.get(key),
    setAttribute: (key, value) => attrs.set(key, value),
    addEventListener: (key, fn) => { listeners[key] = fn; },
    removeEventListener() {},
    decode: () => new Promise(resolve => { ready = resolve; }),
    get src() { return attrs.get('src'); },
    set src(value) { writes++; attrs.set('src', value); this.complete = false; }
  };
  const context = vm.createContext({
    document: { createElement: () => {
      canvas = { style: {}, setAttribute() {}, getContext: () => ({ drawImage: candidate => assert.equal(candidate, img) }) };
      return canvas;
    } },
    requestFrame: cb => frames.push(cb), setTimeout: cb => timers.push(cb), reducedMotion: false,
    getMediaSrc: el => el.getAttribute('src'), updateMediaLoaded() {}, syncAllFramesForUrl() {}
  });
  vm.runInContext(functions, context);
  context.setMediaSrc(img, 'full.webp');
  assert.equal(slide.children.length, 1, 'old painted image is retained over the visible element');
  assert.equal(canvas.style.opacity, undefined, 'no fade while replacement is decoding');
  assert.equal(writes, 1, 'source assigned once, avoiding a duplicate browser reload');
  assert.equal(frames.length, 0);
  img.complete = true;
  img.naturalWidth = 1600;
  ready();
  await Promise.resolve();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(canvas.style.opacity, undefined, 'wait a second frame for the replacement to paint');
  frames.shift()();
  assert.equal(canvas.style.opacity, '0');
  assert.equal(slide.children.length, 1, 'old pixels remain during the blend');
  timers.shift()();
  assert.equal(slide.children.length, 0);
  assert.equal(img._popupCover, null, 'snapshot resources released');
});

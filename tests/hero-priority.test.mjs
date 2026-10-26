import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const start = source.indexOf('  function loadFullImageAfterThumbnail(');
const code = source.slice(start, source.indexOf('  function advanceImageSourceAfterFailure(', start));

function harness() {
  const images = [];
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; }
    setAttribute(key, value) { this.attrs[key] = value; }
    getAttribute(key) { return this.attrs[key] ?? null; }
    appendChild(child) { this.children.push(child); child.parentNode = this; }
  }
  class FakeImage extends Element {
    constructor() { super('img'); images.push(this); }
  }
  const finished = [];
  const context = vm.createContext({
    document: { createElement: tag => new Element(tag) },
    window: { Image: FakeImage },
    getMediaSrc: () => '/media/thumb.webp',
    setMediaSrc: () => {},
    useAvailableOriginal: () => false,
    finishPortfolioUpgrade: img => finished.push(img),
    URL, Promise, setTimeout,
  });
  vm.runInContext(code, context);
  return { context, images, finished };
}
function heroImage(loaded) {
  return {
    tagName: 'IMG', complete: loaded, naturalWidth: loaded ? 360 : 0,
    attrs: {
      src: '/media/thumb.webp',
      'data-full-src': '/media/photo-2400.webp',
      'data-full-webp': 'photo-480.webp 480w, photo-2400.webp 2400w',
      'data-full-avif': 'photo-480.avif 480w, photo-2400.avif 2400w',
    },
    getAttribute(key) { return this.attrs[key] ?? null; },
    removeAttribute(key) { delete this.attrs[key]; },
    closest(selector) {
      if (selector === '.hero-carousel') return { hero: true };
      if (selector === '.carousel-slide') return { classList: { contains: () => true } };
      return null;
    },
  };
}

test('a full-size hero upgrade waits for its normal thumbnail to load', () => {
  const { context, images, finished } = harness();
  const img = heroImage(false);
  context.loadFullImageAfterThumbnail(img);
  assert.equal(images.length, 0);
  assert.equal(finished.length, 1);
  assert.equal(img.getAttribute('data-full-src'), '/media/photo-2400.webp');
  assert.equal(img._loadingFullImage, false);
});

test('the current hero upgrade is low priority and uses responsive AVIF/WebP candidates', () => {
  const { context, images } = harness();
  const img = heroImage(true);
  context.loadFullImageAfterThumbnail(img);
  assert.equal(images.length, 1);
  const full = images[0];
  assert.equal(full.fetchPriority, 'low');
  assert.equal(full.getAttribute('fetchpriority'), 'low');
  assert.equal(full.sizes, '100vw');
  assert.match(full.srcset, /photo-480\.webp 480w/);
  assert.equal(full.src, '/media/photo-2400.webp');
  const picture = full.parentNode;
  assert.equal(picture?.tagName, 'PICTURE');
  assert.equal(picture.children[0].getAttribute('type'), 'image/avif');
  assert.match(picture.children[0].getAttribute('srcset'), /photo-2400\.avif 2400w/);
  assert.equal(picture.children[0].getAttribute('sizes'), '100vw');
});

test('hero thumbnail pixels are retained during the full-size quality upgrade', () => {
  const holdCode = source.slice(source.indexOf('  function holdPopupImage('), source.indexOf('  function setMediaSrc('));
  const slide = {
    children: [],
    appendChild(node) { this.children.push(node); node.parentNode = this; },
  };
  const img = {
    tagName: 'IMG', complete: true, naturalWidth: 360, naturalHeight: 540,
    style: { transform: '' },
    closest: selector => selector === '.hero-carousel' ? {} : selector === '.carousel-slide' ? slide : null,
  };
  const canvas = {
    className: '', style: {}, setAttribute() {},
    getContext: () => ({ drawImage() {} }),
  };
  const context = vm.createContext({
    document: { createElement: () => canvas },
    window: { getComputedStyle: () => ({ transform: 'matrix(1.02, 0, 0, 1.02, 0, 0)', transformOrigin: '50% 50%' }) },
    requestFrame: cb => cb(), setTimeout: cb => cb(), reducedMotion: false,
  });
  vm.runInContext(holdCode, context);
  const cover = context.holdPopupImage(img);
  assert.ok(cover, 'hero thumbnail pixels are retained');
  assert.equal(canvas.className, 'lb-image-cover');
  assert.equal(canvas.style.transform, 'matrix(1.02, 0, 0, 1.02, 0, 0)');
  assert.equal(slide.children.length, 1);
});

test('hero and viewer retained-pixel covers have responsive CSS', async () => {
  const css = await readFile(new URL('../site/assets/site.css', import.meta.url), 'utf8');
  assert.match(css, /\.hero \.carousel-slide \.lb-image-cover[\s\S]*?object-fit: cover/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.lb-stage \.carousel-slide \.lb-image-cover,\s*\.hero \.carousel-slide \.lb-image-cover \{ transition: none; \}/);
});

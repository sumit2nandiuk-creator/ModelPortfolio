import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { renderModelPage } from '../scripts/lib/render.mjs';
import { variantErrors } from '../scripts/lib/image-variants.mjs';
import { referencedMediaFiles } from '../scripts/lib/validate.mjs';
import createEncoder from '@jsquash/avif/codec/enc/avif_enc.js';
import { defaultOptions } from '@jsquash/avif/meta.js';

const admin = await readFile(new URL('../site/admin/admin.js', import.meta.url), 'utf8');
const helpers = admin.slice(admin.indexOf('  var VARIANT_WIDTHS ='), admin.indexOf('  function thumbnailSource('));
function generationHarness(width, height, failAvif = false) {
  const uploads = [];
  const progress = [];
  let terminated = 0;
  const context = vm.createContext({
    URL, Blob, setTimeout, clearTimeout,
    document: { createElement: () => ({ width: 0, height: 0,
      getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }),
      toBlob: (cb, type) => cb(new Blob(['encoded'], { type }))
    }) },
    window: {
      location: { href: 'https://example.test/admin/' },
      Image: class { constructor() { this.naturalWidth = width; this.naturalHeight = height; } set src(_) { this.onload(); } },
      Worker: class {
        postMessage() { queueMicrotask(() => this.onmessage({ data: failAvif ? { error: 'test failure' } : { buffer: new Uint8Array([1]).buffer } })); }
        terminate() { terminated++; }
      }
    },
    uploadThumbnail: async (blob, label, tier) => {
      uploads.push({ type: blob.type, label, tier });
      return `https://example.test/media/${label}.${blob.type.split('/')[1]}`;
    }
  });
  vm.runInContext(helpers, context);
  return { context, uploads, progress, terminated: () => terminated,
    generate: entries => context.generateImageVariants('blob:original', entries, (...args) => progress.push(args)) };
}

test('large photos generate all eight AVIF/WebP sizes and report each encoding and upload stage', async () => {
  const h = generationHarness(4000, 6000);
  const entry = {};
  await h.generate([entry]);
  assert.deepEqual(Array.from(entry.variants, v => v.width), [480, 480, 960, 960, 1600, 1600, 2400, 2400]);
  assert.deepEqual(Array.from(entry.variants, v => v.height), [720, 720, 1440, 1440, 2400, 2400, 3600, 3600]);
  assert.equal(h.uploads.length, 8);
  assert.equal(h.uploads.filter(v => v.type === 'image/avif').length, 4);
  assert.ok(h.progress.some(([text]) => text.includes('Encoding 2400px AVIF')));
  assert.ok(h.progress.some(([text]) => text.includes('Uploading 2400px AVIF')));
  assert.equal(h.terminated(), 1);
  assert.equal(h.context.hasAllVariants(entry), true);
  await h.generate([entry]);
  assert.equal(h.uploads.length, 8, 'reruns do not regenerate completed variants');
});

test('small originals are not upscaled and duplicate native-width derivatives are omitted', async () => {
  const h = generationHarness(320, 480);
  const entry = {};
  await h.generate([entry]);
  assert.deepEqual(Array.from(entry.variants, v => v.width), [320, 320]);
  assert.deepEqual(Array.from(entry.variants, v => v.height), [480, 480]);
});

test('partial encoding failures preserve successful WebP sizes and retry only missing AVIF variants', async () => {
  const h = generationHarness(800, 1200, true);
  const entry = {};
  await assert.rejects(h.generate([entry]), /test failure/);
  assert.equal(entry.variants.length, 2);
  assert.ok(entry.variants.every(v => v.format === 'webp'));
  assert.equal(h.context.hasAllVariants(entry), false);
  const retry = generationHarness(800, 1200);
  await retry.generate([entry]);
  assert.equal(retry.uploads.length, 2);
  assert.ok(retry.uploads.every(v => v.type === 'image/avif'));
  assert.equal(retry.context.hasAllVariants(entry), true);
});

test('shared original references merge and reuse existing variants', async () => {
  const h = generationHarness(320, 480);
  const a = { variants: [{ file: 'a.webp', width: 320, height: 480, format: 'webp' }] };
  const b = { variants: [{ file: 'b.avif', width: 320, height: 480, format: 'avif' }] };
  await h.generate([a, b]);
  assert.equal(h.uploads.length, 0);
  assert.equal(a.variants, b.variants);
});

function variants() {
  return [480, 960, 1600, 2400].flatMap(width => ['avif', 'webp'].map(format => ({ file: `photo-${width}.${format}`, width, height: width * 1.5, format })));
}

test('hero, cards and viewer use responsive candidates without progressive thumbnail attributes', () => {
  const photo = { file: 'original.jpg', width: 4000, height: 6000, thumbnail: 'thumb.webp', preview: 'tiny.webp', variants: variants(), title: 'Look', category: 'Fashion', alt: 'Photo' };
  const html = renderModelPage({ slug: 'test-model', name: 'Test Model', cover: [photo], photos: [photo] }, {
    base: '/', year: 2026, mediaUrl: file => '/media/test-model/' + file,
    sizeOf: () => ({ width: 4000, height: 6000 })
  });
  const pictures = html.match(/<picture>[\s\S]*?<\/picture>/g);
  assert.equal(pictures.length, 2);
  for (const picture of pictures) {
    assert.match(picture, /type="image\/avif"/);
    assert.match(picture, /photo-480.avif 480w/);
    assert.match(picture, /photo-2400.webp 2400w/);
    assert.doesNotMatch(picture, /original.jpg|tiny.webp|thumb.webp|data-full-src|data-medium-src/);
  }
  assert.match(html, /sizes="100vw"/);
  assert.match(html, /sizes="\(max-width: 600px\)/);
  assert.match(html, /data-viewer-avif=/);
  assert.match(html, /imagesrcset="[^"]*photo-480.avif/);
  assert.match(html, /data-src="\/media\/test-model\/photo-2400.webp"/);
});

test('variant schema rejects upscaling, duplicate widths, mismatched extensions and unsafe files', () => {
  const entry = { width: 4000, variants: variants() };
  assert.deepEqual(variantErrors(entry, file => !file.includes('..')), []);
  assert.ok(variantErrors({ width: 200, variants: variants() }, () => true).length);
  assert.ok(variantErrors({ variants: [entry.variants[0], entry.variants[0]] }, () => true).length);
  assert.ok(variantErrors({ variants: [{ ...entry.variants[0], file: 'wrong.webp' }] }, () => true).length);
  assert.ok(variantErrors({ variants: [{ ...entry.variants[0], file: '../photo.avif' }] }, file => !file.includes('..')).length);
  const files = referencedMediaFiles({ cover: { file: 'original.jpg', variants: variants() } });
  assert.equal(files.length, 9, 'static builds include local derivative files');
});

test('the real WASM encoder produces AVIF bytes at the chosen quality settings', async () => {
  const module = await createEncoder({ wasmBinary: await readFile(new URL('../node_modules/@jsquash/avif/codec/enc/avif_enc.wasm', import.meta.url)) });
  const encoded = module.encode(new Uint8Array(16 * 16 * 4).fill(180), 16, 16, { ...defaultOptions, quality: 55, speed: 8 });
  assert.ok(encoded.byteLength > 0);
  assert.match(new TextDecoder().decode(encoded.subarray(4, 16)), /ftypavif/);
});

test('responsive viewer installs AVIF and WebP candidates instead of downloading the original', async () => {
  const script = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
  const start = script.indexOf('    function setPopupImage(img, item)');
  const code = script.slice(start, script.indexOf('    // Loads the photo on screen', start));
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; }
    setAttribute(key, value) { this.attrs[key] = value; }
    appendChild(child) {
      if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(c => c !== child);
      this.children.push(child); child.parentNode = this;
    }
    insertBefore(child, existing) { this.children.splice(this.children.indexOf(existing), 0, child); child.parentNode = this; }
  }
  const figure = new Element('figure');
  const img = new Element('img');
  figure.appendChild(img);
  const context = vm.createContext({ document: { createElement: tag => new Element(tag) }, setMediaSrc: (el, src) => el.setAttribute('src', src) });
  vm.runInContext(code, context);
  context.setPopupImage(img, { src: '2400.webp', webp: '480.webp 480w, 2400.webp 2400w', avif: '480.avif 480w, 2400.avif 2400w' });
  assert.equal(figure.children[0].tagName, 'PICTURE');
  assert.equal(figure.children[0].children[0].attrs.type, 'image/avif');
  assert.equal(img.attrs.sizes, '100vw');
  assert.equal(img.attrs.src, '2400.webp');
  assert.match(img.attrs.srcset, /480w/);
  assert.equal(img.attrs['data-full-src'], undefined);
});

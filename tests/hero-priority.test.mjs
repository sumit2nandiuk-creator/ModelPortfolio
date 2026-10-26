import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { renderModelPage } from '../scripts/lib/render.mjs';

const siteJs = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../site/assets/site.css', import.meta.url), 'utf8');

const variants = prefix => [480, 960, 1600, 2400].flatMap(width =>
  ['avif', 'webp'].map(format => ({
    file: `${prefix}-${width}.${format}`, width, height: Math.round(width * 1.5), format,
  })));
const model = {
  slug: 'hero', name: 'Hero',
  cover: [
    { file: 'one.jpg', thumbnail: 'one-thumb.webp', preview: 'one-tiny.webp', variants: variants('one'), alt: 'One' },
    { file: 'two.jpg', thumbnail: 'two-thumb.webp', preview: 'two-tiny.webp', variants: variants('two'), alt: 'Two' },
  ],
  photos: [],
};
const html = renderModelPage(model, {
  base: '/', year: 2026, mediaUrl: file => '/media/hero/' + file,
  sizeOf: () => ({ width: 4000, height: 6000 }),
});
const heroStart = html.indexOf('<section class="hero"');
const hero = html.slice(heroStart, html.indexOf('</section>', heroStart));

test('hero slides directly reference full-size responsive images', () => {
  assert.equal((hero.match(/class="hero-media"/g) ?? []).length, 2);
  assert.match(hero, /src="\/media\/hero\/one-2400\.webp"/);
  assert.match(hero, /src="\/media\/hero\/two-2400\.webp"/);
  assert.match(hero, /srcset="[^"]*one-480\.avif 480w/);
  assert.match(hero, /srcset="[^"]*one-2400\.webp 2400w/);
  assert.equal((hero.match(/loading="eager" fetchpriority="high"/g) ?? []).length, 2);
  assert.doesNotMatch(hero, /thumb|tiny|preview|data-full-src|data-medium-src|data-full-webp|data-full-avif/);
});

test('first hero image preload is discovered before the title, fonts and CSS', () => {
  const preload = html.indexOf('<link rel="preload" as="image"');
  assert.ok(preload >= 0, 'first full-size hero image is preloaded');
  assert.ok(preload < html.indexOf('<title>'), 'preload appears before the page title');
  assert.ok(preload < html.indexOf('as="font"'), 'preload appears before the font');
  assert.ok(preload < html.indexOf('rel="stylesheet"'), 'preload appears before stylesheets');
  assert.match(html, /<link rel="preload" as="image" type="image\/avif" href="\/media\/hero\/one-2400\.avif" imagesrcset="[^"]*one-480\.avif[^"]*" imagesizes="100vw" fetchpriority="high">/);
  assert.doesNotMatch(html, /<link rel="preload" as="image"[^>]*two-2400/);
});

test('site JS no longer contains hero thumbnail-upgrade attributes', () => {
  assert.doesNotMatch(siteJs, /data-full-webp|data-full-avif/);
  assert.doesNotMatch(siteJs, /var heroCarousel = img\.closest/);
  assert.match(siteJs, /full\.fetchPriority = 'low'/);
});

test('hero source changes still retain painted pixels', () => {
  const holdCode = siteJs.slice(siteJs.indexOf('  function holdPopupImage('), siteJs.indexOf('  function setMediaSrc('));
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
  assert.ok(cover, 'painted hero pixels are retained');
  assert.equal(canvas.className, 'lb-image-cover');
  assert.equal(canvas.style.transform, 'matrix(1.02, 0, 0, 1.02, 0, 0)');
  assert.equal(slide.children.length, 1);
});

test('hero and viewer retained-pixel covers have responsive CSS', () => {
  assert.match(css, /\.hero \.carousel-slide \.lb-image-cover[\s\S]*?object-fit: cover/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.lb-stage \.carousel-slide \.lb-image-cover,\s*\.hero \.carousel-slide \.lb-image-cover \{ transition: none; \}/);
});

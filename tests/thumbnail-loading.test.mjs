import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderModelPage } from '../scripts/lib/render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const media = (file) => file.startsWith('http') ? file : `/media/jane-doe/${encodeURIComponent(file)}`;

const profile = {
  slug: 'jane-doe',
  name: 'Jane Doe',
  cover: { file: 'cover.jpg', preview: 'cover-preview.webp', thumbnail: 'cover-thumb.webp', alt: 'Jane' },
  photos: [{ file: 'photo.jpg', preview: 'photo-preview.webp', thumbnail: 'photo-thumb.webp', title: 'Look', category: 'Editorial' }],
  videos: [{ file: 'reel.mp4', poster: 'poster.jpg', posterThumbnail: 'poster-thumb.webp', title: 'Reel', category: 'Film' }],
};

function render(model = profile) {
  return renderModelPage(model, {
    year: 2026,
    base: '/',
    mediaUrl: media,
    sizeOf: () => null,
  });
}

test('site markup loads the hero full-size directly while gallery cards keep progressive thumbnails', () => {
  const html = render();
  const heroStart = html.indexOf('<section class="hero"');
  const hero = html.slice(heroStart, html.indexOf('</section>', heroStart));
  assert.match(hero, /<img class="hero-media" src="\/media\/jane-doe\/cover\.jpg" alt="Jane" loading="eager" fetchpriority="high"/);
  assert.match(hero, /data-src="\/media\/jane-doe\/cover\.jpg"/);
  assert.doesNotMatch(hero, /cover-thumb|cover-preview|data-full-src|data-medium-src/);
  assert.match(html, /<img src="\/media\/jane-doe\/photo-preview\.webp" data-medium-src="\/media\/jane-doe\/photo-thumb\.webp" data-full-src="\/media\/jane-doe\/photo\.jpg"/);
  assert.match(html, /data-src="\/media\/jane-doe\/photo\.jpg" data-thumb="\/media\/jane-doe\/photo-thumb\.webp"/);
  assert.match(html, /poster="\/media\/jane-doe\/poster-thumb\.webp" data-full-poster="\/media\/jane-doe\/poster\.jpg"/);
  assert.match(html, /<link rel="preload" as="image" href="\/media\/jane-doe\/cover\.jpg" fetchpriority="high">/);
  assert.ok(html.indexOf('<link rel="preload" as="image"') < html.indexOf('<title>'), 'hero image is discovered before page metadata');
  assert.ok(html.indexOf('<link rel="preload" as="image"') < html.indexOf('as="font"'), 'hero image is discovered before the font');
});

test('cover slideshow loads full-size images at high priority and preloads only the first', () => {
  const html = render({
    ...profile,
    cover: [
      { file: 'cover-1.jpg', preview: 'cover-1-preview.webp', thumbnail: 'cover-1-thumb.webp', alt: 'First cover' },
      { file: 'cover-2.jpg', preview: 'cover-2-preview.webp', thumbnail: 'cover-2-thumb.webp', alt: 'Second cover' },
      { file: 'cover-3.jpg', preview: 'cover-3-preview.webp', thumbnail: 'cover-3-thumb.webp', alt: 'Third cover' },
      { file: 'cover-4.jpg', preview: 'cover-4-preview.webp', thumbnail: 'cover-4-thumb.webp', alt: 'Fourth cover' },
    ],
  });
  const heroStart = html.indexOf('<section class="hero"');
  const hero = html.slice(heroStart, html.indexOf('</section>', heroStart));
  for (let i = 1; i <= 4; i++) {
    assert.match(hero, new RegExp(`src="/media/jane-doe/cover-${i}\\.jpg" alt="[^"]*" loading="eager" fetchpriority="high"`));
  }
  assert.equal((hero.match(/loading="eager" fetchpriority="high"/g) ?? []).length, 4);
  assert.doesNotMatch(hero, /loading="lazy"|data-medium-src|data-full-src|preview|thumb/);
  assert.match(html, /<link rel="preload" as="image" href="\/media\/jane-doe\/cover-1\.jpg" fetchpriority="high">/);
  assert.doesNotMatch(html, /<link rel="preload" as="image" href="\/media\/jane-doe\/cover-[2-4]/);
  assert.ok(html.indexOf('<link rel="preload" as="image"') < html.indexOf('<title>'));
});

test('profiles without thumbnails retain their original image and video poster markup', () => {
  const html = render({
    ...profile,
    cover: { file: 'cover.jpg', alt: 'Jane' },
    photos: [{ file: 'photo.jpg', title: 'Look', category: 'Editorial' }],
    videos: [{ file: 'reel.mp4', poster: 'poster.jpg', title: 'Reel', category: 'Film' }],
  });
  assert.match(html, /<img class="hero-media" src="\/media\/jane-doe\/cover\.jpg"(?! data-full-src)/);
  assert.match(html, /<img src="\/media\/jane-doe\/photo\.jpg"(?! data-full-src)/);
  assert.match(html, /poster="\/media\/jane-doe\/poster\.jpg"(?! data-full-poster)/);
});

test('admin exposes the Generate Thumbnails action and the site upgrades thumbnail images after full image download', async () => {
  const admin = await fs.readFile(path.join(root, 'site', 'admin', 'index.html'), 'utf8');
  const siteJs = await fs.readFile(path.join(root, 'site', 'assets', 'site.js'), 'utf8');
  assert.match(admin, /id="generate-thumbnails"[^>]*aria-label="Generate thumbnails and variants"/);
  assert.match(admin, /id="new-model"[^>]*aria-label="New profile"/);
  assert.match(admin, /href="\.\.\/errors"[^>]*aria-label="Application errors"/);
  assert.match(admin, /id="view-site"[^>]*aria-label="View site"/);
  assert.match(siteJs, /function loadFullImageAfterThumbnail\(img\)/);
  assert.match(siteJs, /full\.src = fullUrl/);
  assert.doesNotMatch(siteJs, /data-full-webp|data-full-avif/);
  assert.match(siteJs, /img\.removeAttribute\('data-full-src'\)[\s\S]*?setMediaSrc\(img, fullUrl\)/);
  assert.match(siteJs, /activeImg\.complete && \(activeImg\.naturalWidth \|\| 0\) > 0\)[\s\S]*?loadFullImageAfterThumbnail\(activeImg\)/);
});

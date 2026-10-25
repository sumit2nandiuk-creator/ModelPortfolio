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
  cover: { file: 'cover.jpg', thumbnail: 'cover-thumb.webp', alt: 'Jane' },
  photos: [{ file: 'photo.jpg', thumbnail: 'photo-thumb.webp', title: 'Look', category: 'Editorial' }],
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

test('site markup starts with R2 thumbnails and retains full-size sources for progressive replacement and popup', () => {
  const html = render();
  assert.match(html, /<img class="hero-media" src="\/media\/jane-doe\/cover-thumb\.webp" data-full-src="\/media\/jane-doe\/cover\.jpg"/);
  assert.match(html, /data-src="\/media\/jane-doe\/cover\.jpg" data-thumb="\/media\/jane-doe\/cover-thumb\.webp"/);
  assert.match(html, /<img src="\/media\/jane-doe\/photo-thumb\.webp" data-full-src="\/media\/jane-doe\/photo\.jpg"/);
  assert.match(html, /data-src="\/media\/jane-doe\/photo\.jpg" data-thumb="\/media\/jane-doe\/photo-thumb\.webp"/);
  assert.match(html, /poster="\/media\/jane-doe\/poster-thumb\.webp" data-full-poster="\/media\/jane-doe\/poster\.jpg"/);
  assert.match(html, /<link rel="preload" as="image" href="\/media\/jane-doe\/cover-thumb\.webp" fetchpriority="high">/);
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
  assert.match(admin, /id="generate-thumbnails"[^>]*>Generate Thumbnails<\/button>/);
  assert.match(siteJs, /function loadFullImageAfterThumbnail\(img\)/);
  assert.match(siteJs, /full\.onload = function \(\)[\s\S]*?img\.removeAttribute\('data-full-src'\)[\s\S]*?setMediaSrc\(img, fullUrl\)/);
});

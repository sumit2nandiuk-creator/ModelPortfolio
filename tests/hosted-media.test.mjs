// Tests for media hosted outside the repo (for example Cloudflare R2): the build must
// link to the hosted URL, skip copying it, and still reserve its layout space.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, BuildError } from '../scripts/build.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(repoRoot, 'site');
const R2 = 'https://media.example.test';

async function workspaceWith(model) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hosted-test-'));
  const modelsDir = path.join(root, 'models');
  await fs.mkdir(path.join(modelsDir, model.slug, 'media'), { recursive: true });
  await fs.writeFile(path.join(modelsDir, model.slug, 'model.json'), JSON.stringify(model, null, 2));
  return { root, modelsDir, outDir: path.join(root, 'dist') };
}

function profile(overrides = {}) {
  return {
    slug: 'jane-doe',
    name: 'Jane Doe',
    cover: { file: `${R2}/jane-doe/1-a-cover.jpg`, alt: 'Jane', width: 1200, height: 1600 },
    photos: [{ file: `${R2}/jane-doe/2-b-photo.webp`, title: 'Bridal', category: 'Bridal', width: 900, height: 1200 }],
    videos: [
      {
        file: `${R2}/jane-doe/3-c-reel.mp4`,
        title: 'Reel',
        category: 'Showreel',
        poster: `${R2}/jane-doe/4-d-poster.jpg`,
        posterWidth: 1280,
        posterHeight: 720,
      },
    ],
    ...overrides,
  };
}

test('hosted files are linked as they are, with their size, and nothing is copied', async () => {
  const ws = await workspaceWith(profile());
  await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir, year: 2026, basePath: '/' });

  const html = await fs.readFile(path.join(ws.outDir, 'jane-doe', 'index.html'), 'utf8');
  assert.match(html, /src="https:\/\/media\.example\.test\/jane-doe\/1-a-cover\.jpg"[^>]*width="1200" height="1600"/);
  assert.match(html, /src="https:\/\/media\.example\.test\/jane-doe\/2-b-photo\.webp"/);
  assert.match(html, /poster="https:\/\/media\.example\.test\/jane-doe\/4-d-poster\.jpg"/);
  assert.match(html, /src="https:\/\/media\.example\.test\/jane-doe\/3-c-reel\.mp4"/);

  // Nothing was copied into the model's own media folder.
  const copied = await fs.readdir(path.join(ws.outDir, 'jane-doe', 'media')).catch(() => []);
  assert.deepEqual(copied, []);
});

test('a hosted file with an unsupported extension is refused', async () => {
  const ws = await workspaceWith(profile({ photos: [{ file: `${R2}/jane-doe/2-b-photo.exe`, title: 'x', category: 'y' }] }));
  await assert.rejects(
    build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir, year: 2026, basePath: '/' }),
    (err) => err instanceof BuildError && err.errors.some((e) => /unsupported type/.test(e)),
  );
});

test('a non-whole-number size is refused', async () => {
  const ws = await workspaceWith(profile({ cover: { file: `${R2}/jane-doe/1-a-cover.jpg`, alt: 'Jane', width: 12.5, height: 1600 } }));
  await assert.rejects(
    build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir, year: 2026, basePath: '/' }),
    (err) => err instanceof BuildError && err.errors.some((e) => /positive whole number/.test(e)),
  );
});

test('the admin page is published under /admin/ and marked noindex', async () => {
  const ws = await workspaceWith(profile());
  await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir, year: 2026, basePath: '/' });
  const admin = await fs.readFile(path.join(ws.outDir, 'admin', 'index.html'), 'utf8');
  assert.match(admin, /<meta name="robots" content="noindex,nofollow">/);
});

// Tests for the build pipeline. The most important guarantee tested here is
// isolation: a model's pages and files never expose any other model.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, BuildError, normalizeBasePath } from '../scripts/build.mjs';
import { imageSize } from '../scripts/lib/image-size.mjs';
import { esc } from '../scripts/lib/render.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(repoRoot, 'site');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Writes a valid model with one photo and one video into <modelsDir>/<slug>/.
async function writeModel(modelsDir, slug, name, overrides = {}) {
  const dir = path.join(modelsDir, slug);
  await fs.mkdir(path.join(dir, 'media'), { recursive: true });
  // Minimal valid 1x1 PNG so the image-size reader has something to read.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await fs.writeFile(path.join(dir, 'media', `${slug}-cover.png`), png);
  await fs.writeFile(path.join(dir, 'media', `${slug}-photo.png`), png);
  await fs.writeFile(path.join(dir, 'media', `${slug}-reel.mp4`), 'fake video');
  await fs.writeFile(path.join(dir, 'media', `${slug}-unused.png`), png); // not referenced by model.json

  const model = {
    slug,
    name,
    tagline: `${name} tagline`,
    bio: [`${name} bio paragraph.`],
    stats: [{ label: 'Height', value: '180 cm' }],
    cover: { file: `${slug}-cover.png`, alt: `${name} cover` },
    photos: [{ file: `${slug}-photo.png`, title: `${name} photo`, category: 'Editorial', year: '2026' }],
    videos: [{ file: `${slug}-reel.mp4`, title: `${name} reel`, category: 'Showreel' }],
    contact: { email: `${slug}@example.com`, location: 'Somewhere' },
    ...overrides,
  };
  await fs.writeFile(path.join(dir, 'model.json'), JSON.stringify(model, null, 2));
  return model;
}

async function tempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-test-'));
  return {
    root,
    modelsDir: path.join(root, 'models'),
    outDir: path.join(root, 'dist'),
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

test('each model is published only under its own URL', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'alpha-model', 'Alpha Person');
    await writeModel(ws.modelsDir, 'beta-model', 'Beta Person');

    const built = await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir, year: 2026 });
    assert.deepEqual(built.sort(), ['alpha-model', 'beta-model']);

    // Each model page exists and is about that model only.
    const alphaHtml = await fs.readFile(path.join(ws.outDir, 'alpha-model', 'index.html'), 'utf8');
    const betaHtml = await fs.readFile(path.join(ws.outDir, 'beta-model', 'index.html'), 'utf8');
    assert.match(alphaHtml, /Alpha Person/);
    assert.doesNotMatch(alphaHtml, /Beta Person|beta-model|beta-model@example\.com/);
    assert.match(betaHtml, /Beta Person/);
    assert.doesNotMatch(betaHtml, /Alpha Person|alpha-model|alpha-model@example\.com/);

    // Media is isolated: only this model's referenced files are published.
    const alphaMedia = (await fs.readdir(path.join(ws.outDir, 'alpha-model', 'media'))).sort();
    assert.deepEqual(alphaMedia, ['alpha-model-cover.png', 'alpha-model-photo.png', 'alpha-model-reel.mp4']);
    assert.equal(await exists(path.join(ws.outDir, 'beta-model', 'media', 'alpha-model-cover.png')), false);
    assert.equal(await exists(path.join(ws.outDir, 'alpha-model', 'media', 'beta-model-cover.png')), false);

    // Unreferenced files in the source folder are never published.
    assert.equal(await exists(path.join(ws.outDir, 'alpha-model', 'media', 'alpha-model-unused.png')), false);

    // The neutral 404 page (served for "/" and unknown URLs) exposes no model names and links to no model.
    assert.equal(await exists(path.join(ws.outDir, 'index.html')), false);
    const notFoundHtml = await fs.readFile(path.join(ws.outDir, '404.html'), 'utf8');
    for (const html of [notFoundHtml]) {
      assert.doesNotMatch(html, /Alpha|Beta|alpha-model|beta-model/i);
      const links = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
      assert.deepEqual(links.filter((l) => !l.startsWith('/assets/')), []);
    }
  } finally {
    await ws.cleanup();
  }
});

test('pages contain no cross-model links and no listing of models', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'alpha-model', 'Alpha Person');
    await writeModel(ws.modelsDir, 'beta-model', 'Beta Person');
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });

    for (const slug of ['alpha-model', 'beta-model']) {
      const html = await fs.readFile(path.join(ws.outDir, slug, 'index.html'), 'utf8');
      const hrefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
      for (const ref of hrefs) {
        if (ref.startsWith('/') && !ref.startsWith('//')) {
          const allowed = ref.startsWith(`/${slug}/`) || ref.startsWith('/assets/');
          assert.ok(allowed, `${slug} page links to foreign path: ${ref}`);
        }
      }
    }
  } finally {
    await ws.cleanup();
  }
});

test('folders starting with "_" are templates and are not published', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(path.join(ws.modelsDir, '_template'), { recursive: true });
    await fs.writeFile(path.join(ws.modelsDir, '_template', 'model.json'), '{"slug":"nope"}');
    await writeModel(ws.modelsDir, 'alpha-model', 'Alpha Person');
    const built = await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    assert.deepEqual(built, ['alpha-model']);
    assert.equal(await exists(path.join(ws.outDir, '_template')), false);
  } finally {
    await ws.cleanup();
  }
});

test('the real models/ folder builds and the template is skipped', async () => {
  const ws = await tempWorkspace();
  try {
    const built = await build({ siteDir, outDir: ws.outDir });
    assert.deepEqual(built, ['sushmita-ghosh']);
    const html = await fs.readFile(path.join(ws.outDir, 'sushmita-ghosh', 'index.html'), 'utf8');
    assert.match(html, /<h1[^>]*>Sushmita Ghosh<\/h1>/);
    assert.match(html, /src="\/sushmita-ghosh\/media\/cover\.jpg"/);
    assert.equal(await exists(path.join(ws.outDir, '_template')), false);
  } finally {
    await ws.cleanup();
  }
});

test('invalid profiles fail the build with clear messages', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    // Reserved slug, mismatched folder/slug, missing media, path traversal.
    await writeModel(ws.modelsDir, 'assets', 'Reserved Person');
    await writeModel(ws.modelsDir, 'mismatch-folder', 'Mismatch Person', { slug: 'other-slug' });
    await writeModel(ws.modelsDir, 'missing-media', 'Missing Person', {
      photos: [{ file: 'does-not-exist.jpg', title: 'x', category: 'Editorial' }],
    });
    await writeModel(ws.modelsDir, 'traversal', 'Traversal Person', {
      photos: [{ file: '../../secret.jpg', title: 'x', category: 'Editorial' }],
    });

    await assert.rejects(
      () => build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir }),
      (err) => {
        assert.ok(err instanceof BuildError);
        const text = err.errors.join('\n');
        assert.match(text, /\[assets\].*reserved/);
        assert.match(text, /\[mismatch-folder\].*must match the folder name/);
        assert.match(text, /\[missing-media\].*does-not-exist\.jpg.*not found/);
        assert.match(text, /\[traversal\].*plain file name/);
        return true;
      },
    );
    // Nothing is published when validation fails.
    assert.equal(await exists(ws.outDir), false);
  } finally {
    await ws.cleanup();
  }
});

test('user text is HTML-escaped', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'alpha-model', '<script>alert(1)</script>');
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'alpha-model', 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  } finally {
    await ws.cleanup();
  }
});

test('esc() escapes the five HTML-significant characters', () => {
  assert.equal(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(undefined), '');
});

test('imageSize reads PNG and JPEG dimensions', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  assert.deepEqual(imageSize(png), { width: 1, height: 1 });

  // Minimal JPEG: SOI, APP0 segment, then SOF0 with height=300, width=400.
  const jpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x01, 0x00, 0x00,
  ]);
  assert.deepEqual(imageSize(jpeg), { width: 400, height: 300 });
  assert.equal(imageSize(Buffer.from('not an image')), null);
});

test('navigation only links to sections that exist for that model', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'alpha-model', 'Alpha Person', { videos: [] });
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'alpha-model', 'index.html'), 'utf8');
    assert.doesNotMatch(html, /href="#videos"/);
    assert.doesNotMatch(html, /id="videos"/);
    assert.match(html, /href="#portfolio"/);
    assert.match(html, /href="#contact"/);
  } finally {
    await ws.cleanup();
  }
});

test('seo.noindex keeps a profile out of search results', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'alpha-model', 'Alpha Person', { seo: { noindex: true } });
    await writeModel(ws.modelsDir, 'beta-model', 'Beta Person');
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const alpha = await fs.readFile(path.join(ws.outDir, 'alpha-model', 'index.html'), 'utf8');
    const beta = await fs.readFile(path.join(ws.outDir, 'beta-model', 'index.html'), 'utf8');
    assert.match(alpha, /name="robots" content="noindex,nofollow"/);
    assert.match(beta, /name="robots" content="index,follow"/);
  } finally {
    await ws.cleanup();
  }
});

test('normalizeBasePath produces "/" or "/name/"', () => {
  assert.equal(normalizeBasePath(undefined), '/');
  assert.equal(normalizeBasePath(''), '/');
  assert.equal(normalizeBasePath('/'), '/');
  assert.equal(normalizeBasePath('ModelPortfolio'), '/ModelPortfolio/');
  assert.equal(normalizeBasePath('/ModelPortfolio/'), '/ModelPortfolio/');
});

test('base path prefixes every root-relative URL (GitHub Pages project sites)', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'alpha-model', 'Alpha Person');
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir, basePath: '/ModelPortfolio/' });

    const pages = [
      path.join(ws.outDir, 'alpha-model', 'index.html'),
      path.join(ws.outDir, '404.html'),
    ];
    for (const file of pages) {
      const html = await fs.readFile(file, 'utf8');
      const urls = [...html.matchAll(/(?:href|src|content)="(\/[^"]*)"/g)].map((m) => m[1]);
      assert.ok(urls.length > 0);
      for (const url of urls) {
        assert.ok(url.startsWith('/ModelPortfolio/'), `${path.basename(path.dirname(file))}: ${url} is missing the base path`);
      }
    }
    const html = await fs.readFile(path.join(ws.outDir, 'alpha-model', 'index.html'), 'utf8');
    assert.match(html, /src="\/ModelPortfolio\/alpha-model\/media\/alpha-model-cover\.png"/);
    assert.match(html, /href="\/ModelPortfolio\/assets\/site\.css"/);
    assert.match(html, /src="\/ModelPortfolio\/assets\/site\.js"/);
    assert.ok(await exists(path.join(ws.outDir, '.nojekyll')));
  } finally {
    await ws.cleanup();
  }
});

test('splitName builds the two-line header lockup', async () => {
  const { splitName } = await import('../scripts/lib/render.mjs');
  assert.deepEqual(splitName('Sushmita Ghosh'), { given: 'Sushmita', family: 'Ghosh' });
  assert.deepEqual(splitName('Maria de la Cruz'), { given: 'Maria de la', family: 'Cruz' });
  assert.deepEqual(splitName('  Cher  '), { given: 'Cher', family: '' });
  assert.deepEqual(splitName(''), { given: '', family: '' });
});

test('header shows the given and family name, with the full name for screen readers', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'alpha-model', 'Alpha Person');
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'alpha-model', 'index.html'), 'utf8');
    assert.match(html, /<span class="brand-given">Alpha<\/span>/);
    assert.match(html, /<span class="brand-family">Person<\/span>/);
    assert.match(html, /<a class="brand" href="#top" aria-label="Alpha Person – back to top">/);
  } finally {
    await ws.cleanup();
  }
});

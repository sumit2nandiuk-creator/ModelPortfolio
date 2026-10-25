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

  // JPEG with EXIF APP1 Orientation=6 (rotated 90° CW): raw 400x300 reports visual 300x400 portrait.
  const rotatedJpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x1e,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF big-endian, IFD0 @ 8
    0x00, 0x01, // 1 entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation = 6
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x01, 0x00, 0x00,
  ]);
  assert.deepEqual(imageSize(rotatedJpeg), { width: 300, height: 400 });
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
    assert.match(beta, /name="robots" content="index,follow,noimageindex"/);
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

test('every "#top" link has a real target, and the header is not the target', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'alpha-model', 'Alpha Person');
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'alpha-model', 'index.html'), 'utf8');
    const targets = html.match(/id="top"/g) ?? [];
    assert.equal(targets.length, 1, 'exactly one element has id="top"');
    assert.doesNotMatch(html, /<header[^>]*id="top"/, 'the fixed header is not the target');
    assert.match(html, /<div id="top" class="top-anchor"/);
    assert.match(html, /href="#top"/);
  } finally {
    await ws.cleanup();
  }
});

test('hero has no visible name over the cover, a bottom button row, no tagline or scroll cue', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'alpha-model', 'Alpha Person', { tagline: 'Tagline Words' });
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'alpha-model', 'index.html'), 'utf8');
    const hero = html.slice(html.indexOf('<section class="hero"'), html.indexOf('</section>', html.indexOf('<section class="hero"')));
    assert.doesNotMatch(hero, /Tagline Words/);
    assert.doesNotMatch(hero, /scroll-cue/);
    // The name is kept for screen readers and search, but not drawn over the cover photo.
    assert.match(hero, /<h1 id="hero-title" class="sr-only">Alpha Person<\/h1>/);
    assert.doesNotMatch(hero, /hero-name|hero-content/);
    assert.doesNotMatch(hero, /hero-actions|View portfolio|Get in touch/);
  } finally {
    await ws.cleanup();
  }
});

test('the header brand renders both names in one row', async () => {
  const { splitName } = await import('../scripts/lib/render.mjs');
  assert.deepEqual(splitName('Sushmita Ghosh'), { given: 'Sushmita', family: 'Ghosh' });
});

test('photos and videos are protected from easy saving', async () => {
  const ws = await tempWorkspace();
  try {
    await writeModel(ws.modelsDir, 'jane-doe', 'Jane Doe');
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'jane-doe', 'index.html'), 'utf8');
    // Every <img> is non-draggable.
    const imgs = html.match(/<img [^>]*>/g) ?? [];
    assert.ok(imgs.length > 0);
    for (const img of imgs) assert.match(img, /draggable="false"/, img);
    // Videos: no download, no remote playback, no picture-in-picture.
    const videos = html.match(/<video [^>]*>/g) ?? [];
    assert.ok(videos.length > 0);
    for (const v of videos) {
      assert.match(v, /controlsList="nodownload noremoteplayback"/);
      assert.match(v, /disablePictureInPicture/);
    }
    // Model pages keep photos out of image search.
    assert.match(html, /<meta name="robots" content="index,follow,noimageindex">/);
    // The script blocks the context menu and native drag on media.
    const js = await fs.readFile(path.join(siteDir, 'assets', 'site.js'), 'utf8');
    assert.match(js, /addEventListener\('contextmenu'/);
    assert.match(js, /addEventListener\('dragstart'/);
  } finally {
    await ws.cleanup();
  }
});

test('the Sushmita Ghosh profile has compact mobile-friendly stats with no shoe size', async () => {
  const css = await fs.readFile(path.join(siteDir, 'assets', 'site.css'), 'utf8');
  assert.match(css, /\.stats \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.stat--full \{[\s\S]*?grid-column: 1 \/ -1;/);
  assert.match(css, /\.stat--full \{[\s\S]*?display: grid;/);
  assert.match(css, /\.stat--full dd \{[\s\S]*?text-align: left;/);
  // Measurement label font and color match "ABOUT" in Profile & About section
  assert.match(css, /\.stat dt \{[\s\S]*?font-family:\s*var\(--font-about-label-family,\s*var\(--font-captions-family\)\);/);
  assert.match(css, /\.stat dt \{[\s\S]*?color:\s*var\(--font-about-label-color,\s*var\(--accent\)\);/);
  // Category / Row Title font style and color match "ABOUT" in Profile & About section
  assert.match(css, /\.media-group-title \{[\s\S]*?font-family:\s*var\(--font-about-label-family,\s*var\(--font-captions-family\)\);/);
  assert.match(css, /\.media-group-title \{[\s\S]*?color:\s*var\(--font-about-label-color,\s*var\(--accent\)\);/);
  assert.match(css, /\.media-group-title \{[\s\S]*?text-transform:\s*uppercase;/);
  assert.match(css, /\.media-group-title \{[\s\S]*?font-size:\s*calc\(0\.72rem/);

  const ws = await tempWorkspace();
  try {
    await build({ siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'sushmita-ghosh', 'index.html'), 'utf8');
    assert.match(html, /<div class="stat"><dt>Height<\/dt><dd>5′4″<\/dd><\/div>/);
    assert.match(html, /<div class="stat"><dt>Eyes<\/dt><dd>Black<\/dd><\/div>/);
    assert.match(html, /<div class="stat"><dt>Hair<\/dt><dd>Black<\/dd><\/div>/);
    assert.match(html, /<div class="stat stat--full"><dt>Languages<\/dt><dd>English · Bengali · Hindi<\/dd><\/div>/);
    assert.doesNotMatch(html, /Shoe/);
  } finally {
    await ws.cleanup();
  }

  // When portfolioHeading says "Categories", the section heading saying "Categories" is removed
  const catWs = await tempWorkspace();
  try {
    await writeModel(catWs.modelsDir, 'cat-model', 'Cat Model', {
      texts: { portfolioLabel: 'Portfolio', portfolioHeading: 'Categories' },
    });
    await build({ modelsDir: catWs.modelsDir, siteDir, outDir: catWs.outDir });
    const catHtml = await fs.readFile(path.join(catWs.outDir, 'cat-model', 'index.html'), 'utf8');
    assert.match(catHtml, /<p id="portfolio-label" class="eyebrow">Portfolio<\/p>/);
    assert.doesNotMatch(catHtml, /Categories/);
  } finally {
    await catWs.cleanup();
  }
});

test('contact shows email, phone and WhatsApp as icon cards, with no "Based in" or "Representation"', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'contact-check', 'Contact Check', {
      contact: {
        email: 'sushmitaghosh0099@gmail.com',
        phone: '+91 86977 71768',
        whatsapp: '+91 86977 71768',
        location: 'Somewhere',
        representation: 'Some agency',
      },
    });
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'contact-check', 'index.html'), 'utf8');
    assert.match(html, /Bookings &amp; enquiries/);
    assert.match(html, /href="mailto:sushmitaghosh0099@gmail\.com"/);
    assert.match(html, /href="tel:\+918697771768"/);
    // WhatsApp is no longer a contact card; it is a floating button instead.
    const section = html.slice(html.indexOf('<section id="contact"'), html.indexOf('</section>', html.indexOf('<section id="contact"')));
    assert.doesNotMatch(section, /wa\.me|contact-item--whatsapp/);
    assert.match(html, /<a class="whatsapp-float" href="https:\/\/wa\.me\/918697771768" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">/);
    assert.match(html, /<svg[^>]*>/);
    assert.doesNotMatch(html, /Based in/);
    assert.doesNotMatch(html, /Representation/);
    assert.doesNotMatch(html, /Somewhere|Some agency/);
    assert.doesNotMatch(html, /contact-email|contact-list/);
  } finally {
    await ws.cleanup();
  }
});

test('the Sushmita Ghosh page has the real contact details and no removed sections', async () => {
  const ws = await tempWorkspace();
  try {
    await build({ siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'sushmita-ghosh', 'index.html'), 'utf8');
    assert.match(html, /href="mailto:sushmitaghosh0099@gmail\.com"/);
    assert.match(html, /href="tel:\+918697771768"/);
    assert.match(html, /wa\.me\/918697771768/);
    assert.doesNotMatch(html, /Based in/);
    assert.doesNotMatch(html, /Representation/);
  } finally {
    await ws.cleanup();
  }
});

test('phone and WhatsApp numbers must have at least 8 digits', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'short-phone', 'Short Phone', {
      contact: { phone: '12-34', whatsapp: 'call me' },
    });
    await assert.rejects(
      () => build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir }),
      (err) => {
        assert.ok(err instanceof BuildError);
        const text = err.errors.join('\n');
        assert.match(text, /\[short-phone\].*"contact\.phone" must be a phone number/);
        assert.match(text, /\[short-phone\].*"contact\.whatsapp" must be a phone number/);
        return true;
      },
    );
  } finally {
    await ws.cleanup();
  }
});

test('the cover photo is a tappable slide that opens the viewer, and every gallery photo has one too', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'click-check', 'Click Check');
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'click-check', 'index.html'), 'utf8');
    const hero = html.slice(html.indexOf('<section class="hero"'), html.indexOf('</section>', html.indexOf('<section class="hero"')));
    assert.match(hero, /<button class="carousel-slide" type="button" data-src="\/click-check\/media\/click-check-cover\.png"[^>]*aria-label="Open cover photo"/);
    assert.match(hero, /<img class="hero-media"/);
    // Every gallery photo has a viewer trigger that points at the full image.
    const triggers = html.match(/<button class="gallery-btn"[^>]*data-src="[^"]+"/g) ?? [];
    assert.equal(triggers.length, 1);
    assert.match(triggers[0], /data-src="\/click-check\/media\/click-check-photo\.png"/);
    // The viewer script wires up the cover trigger.
    const js = await fs.readFile(path.join(siteDir, 'assets', 'site.js'), 'utf8');
    assert.match(js, /function createCarousel\(/);
    assert.match(js, /data-goto/);
  } finally {
    await ws.cleanup();
  }
});

test('a cover list builds a slideshow with dots and autoplay; a single cover has neither', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'slides-check', 'Slides Check', {
      cover: [
        { file: 'slides-check-cover.png', alt: 'First cover' },
        { file: 'slides-check-photo.png', alt: 'Second cover' },
        { file: 'slides-check-cover.png', alt: 'Third cover' },
      ],
    });
    await writeModel(ws.modelsDir, 'single-check', 'Single Check');
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });

    const many = await fs.readFile(path.join(ws.outDir, 'slides-check', 'index.html'), 'utf8');
    const manyHero = many.slice(many.indexOf('<section class="hero"'), many.indexOf('</section>', many.indexOf('<section class="hero"')));
    assert.equal((manyHero.match(/class="carousel-slide"/g) ?? []).length, 3);
    assert.equal((manyHero.match(/class="carousel-dot(?: is-active)?"/g) ?? []).length, 3);
    assert.match(manyHero, /data-autoplay="6000"/);
    assert.match(manyHero, /aria-label="Open cover photo 2 of 3"/);
    // Only the first cover is eager; the rest load lazily.
    assert.match(manyHero, /fetchpriority="high"/);

    const single = await fs.readFile(path.join(ws.outDir, 'single-check', 'index.html'), 'utf8');
    const singleHero = single.slice(single.indexOf('<section class="hero"'), single.indexOf('</section>', single.indexOf('<section class="hero"')));
    assert.equal((singleHero.match(/class="carousel-slide"/g) ?? []).length, 1);
    assert.doesNotMatch(singleHero, /carousel-dot/);
    assert.match(singleHero, /data-autoplay="0"/);
  } finally {
    await ws.cleanup();
  }
});

test('every cover photo in a list needs an alt text', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'no-alt', 'No Alt', {
      cover: [{ file: 'no-alt-cover.png', alt: 'Fine' }, { file: 'no-alt-photo.png' }],
    });
    await assert.rejects(
      () => build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir }),
      (err) => {
        assert.ok(err instanceof BuildError);
        assert.match(err.errors.join('\n'), /\[no-alt\].*"cover\[1\]\.alt" is required/);
        return true;
      },
    );
  } finally {
    await ws.cleanup();
  }
});

test('WhatsApp is a floating button in the bottom-right corner, and only when a number is set', async () => {
  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'wa-yes', 'Wa Yes', { contact: { email: 'a@example.com', phone: '+91 86977 71768', whatsapp: '+91 86977 71768' } });
    await writeModel(ws.modelsDir, 'wa-no', 'Wa No', { contact: { email: 'b@example.com' } });
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const yes = await fs.readFile(path.join(ws.outDir, 'wa-yes', 'index.html'), 'utf8');
    const no = await fs.readFile(path.join(ws.outDir, 'wa-no', 'index.html'), 'utf8');
    assert.equal((yes.match(/class="whatsapp-float"/g) ?? []).length, 1);
    assert.match(yes, /aria-label="Chat on WhatsApp"/);
    assert.match(yes, /<svg viewBox="0 0 24 24"/);
    assert.match(yes, /fill="#25D366"/i);
    assert.doesNotMatch(yes, /whatsapp-starburst|whatsapp-tooltip/);
    assert.doesNotMatch(no, /whatsapp-float|wa\.me/);
    const css = await fs.readFile(path.join(siteDir, 'assets', 'site.css'), 'utf8');
    assert.match(css, /\.whatsapp-float \{[\s\S]*?bottom: max\(20px/);
    assert.match(css, /\.whatsapp-float \{[\s\S]*?touch-action: manipulation;/);
    assert.match(css, /\.whatsapp-float svg \{[\s\S]*?pointer-events: none;/);
    assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.whatsapp-float:hover svg/);
    assert.doesNotMatch(css, /\.whatsapp-starburst/);
  } finally {
    await ws.cleanup();
  }
});

test('refreshing a page resets scroll restoration and starts at the top', async () => {
  const ws = await tempWorkspace();
  try {
    await build({ siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'sushmita-ghosh', 'index.html'), 'utf8');
    assert.match(html, /history\.scrollRestoration='manual'/);
    const js = await fs.readFile(path.join(siteDir, 'assets', 'site.js'), 'utf8');
    assert.match(js, /history\.scrollRestoration = 'manual'/);
    assert.match(js, /window\.scrollTo\(0, 0\)/);
  } finally {
    await ws.cleanup();
  }
});

test('email-style text boxes support custom copy, inline rich-text runs, box font settings, and XSS safety', async () => {
  const { FONT_CATALOG, FONT_SLOTS } = await import('../scripts/lib/fonts.mjs');
  const adminJs = await fs.readFile(path.join(siteDir, 'admin', 'admin.js'), 'utf8');
  for (const font of FONT_CATALOG) {
    assert.ok(adminJs.includes(`id: '${font.id}'`), `admin.js includes font ${font.id}`);
  }
  for (const slot of Object.keys(FONT_SLOTS)) {
    assert.ok(adminJs.includes(`key: '${slot}'`), `admin.js includes slot ${slot}`);
  }

  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'styled-model', 'Styled Model', {
      bio: ['First paragraph with <tag> & rich text.'],
      texts: {
        portfolioLabel: 'Bridal & Editorial',
        portfolioHeading: 'Selected Works',
        contactHeading: 'Book Styled Model today.',
      },
      fonts: {
        name: { family: 'playfair-display', style: 'normal', weight: '700', size: 'lg', underline: true, color: '#9a6a3c' },
        portfolioHeading: { family: 'bodoni-moda', style: 'italic', weight: '600', size: 'xl', align: 'center' },
        bio: { family: 'lora', style: 'normal', weight: '400', align: 'left' },
        stats: { family: 'montserrat', style: 'normal', weight: '500', size: 'sm' },
        captions: { family: 'jost', style: 'normal', weight: '400' },
      },
      richText: {
        name: [
          { text: 'Styled ', bold: true },
          { text: 'Model', family: 'great-vibes', italic: true, color: '#c9a77d' },
        ],
        bio: [
          [
            { text: 'First paragraph with ' },
            { text: '<tag>', bold: true, underline: true, size: 'lg', family: 'cinzel', color: '#9a6a3c' },
            { text: ' & rich text.' },
          ],
        ],
      },
    });
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'styled-model', 'index.html'), 'utf8');
    // Both box-level fonts and inline-only fonts (Great Vibes, Cinzel) are loaded from Google Fonts.
    assert.match(html, /family=Playfair\+Display/);
    assert.match(html, /family=Bodoni\+Moda/);
    assert.match(html, /family=Great\+Vibes/);
    assert.match(html, /family=Cinzel/);
    // Box-level CSS custom properties are emitted.
    assert.match(html, /--font-name-family: &#39;Playfair Display&#39;/);
    assert.match(html, /--font-name-scale: 1\.18/);
    assert.match(html, /--font-name-decoration: underline/);
    assert.match(html, /--font-name-color: #9a6a3c/);
    assert.match(html, /--font-portfolio-heading-align: center/);
    // Custom section copy & inline formatted runs render cleanly and escape HTML tags.
    assert.match(html, /Bridal &amp; Editorial/);
    assert.match(html, /Selected Works/);
    assert.match(html, /Book Styled Model today\./);
    assert.match(html, /<span class="brand-given"><strong>Styled<\/strong><\/span>/);
    assert.match(html, /<span class="brand-family"><span style="font-family:&#39;Great Vibes&#39;, cursive;color:#c9a77d"><em>Model<\/em><\/span><\/span>/);
    assert.match(html, /<strong>&lt;tag&gt;<\/strong>/);
  } finally {
    await ws.cleanup();
  }

  const badWs = await tempWorkspace();
  try {
    await fs.mkdir(badWs.modelsDir, { recursive: true });
    await writeModel(badWs.modelsDir, 'bad-font', 'Bad Font', {
      fonts: { name: { family: 'comic-sans-injected' } },
    });
    await assert.rejects(
      () => build({ modelsDir: badWs.modelsDir, siteDir, outDir: badWs.outDir }),
      BuildError,
    );
  } finally {
    await badWs.cleanup();
  }
});

test('sections use balanced vertical padding without extra bottom gaps after stats or media rows', async () => {
  const css = await fs.readFile(path.join(siteDir, 'assets', 'site.css'), 'utf8');
  assert.match(css, /\.section \{\s*padding: clamp\(40px, 6vw, 84px\) 0;\s*\}/);
  assert.doesNotMatch(css, /clamp\(88px,\s*12vw,\s*160px\)/);
  assert.match(css, /\.media-row \{[\s\S]*?padding: 8px 2px 34px;\s*margin: -8px -2px -34px;/);
  assert.match(css, /\.gallery-item \{\s*margin: 0;\s*\}/);
});

test('popup stage preserves pan-y swipe when unzoomed and switches to touch-action: none when zoomed', async () => {
  const css = await fs.readFile(path.join(siteDir, 'assets', 'site.css'), 'utf8');
  assert.match(css, /\.lb-stage \{[\s\S]*?touch-action: pan-y;[\s\S]*?\}/);
  assert.match(css, /\.lb-stage\.is-zoomed \{\s*touch-action: none;\s*\}/);
  assert.match(css, /\.lb-stage \.carousel-slide img \{[\s\S]*?transform-origin: 50% 50%;[\s\S]*?\}/);
});

test('photos in rows are uniform 2:3 size while all-landscape categories keep landscape framing', async () => {
  const css = await fs.readFile(path.join(siteDir, 'assets', 'site.css'), 'utf8');
  assert.doesNotMatch(css, /\.video-frame \{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.doesNotMatch(css, /\.media-row\.is-single \.media-card/);
  assert.match(css, /\.media-row \{[\s\S]*?--row-frame-ratio: 2 \/ 3;/);
  assert.match(css, /\.gallery-btn img \{[\s\S]*?aspect-ratio: var\(--row-frame-ratio, 2 \/ 3\);[\s\S]*?object-fit: cover;/);
  assert.match(css, /\.video-frame \{[\s\S]*?border: clamp\(6px, 0\.9vw, 10px\) solid var\(--white\);[\s\S]*?border-radius: 4px;/);
  assert.match(css, /\.media-row\[data-has-photos="1"\] \.video-frame video \{\s*aspect-ratio: var\(--row-frame-ratio, 2 \/ 3\);\s*\}/);

  // Verify exact 10% right-peek horizontal flex geometry across desktop (N=3), tablet (N=2), and mobile (N=1):
  // N * cardWidth + N * gap + 0.1 * cardWidth = 100%  =>  cardWidth = (100% - N * gap) / (N + 0.1)
  assert.match(css, /\.media-row \{[\s\S]*?--card-basis: calc\(\(100% - 3 \* var\(--row-gap\)\) \/ 3\.1\);[\s\S]*?overflow-x: auto;/);
  assert.match(css, /@media \(max-width: 980px\) \{[\s\S]*?--card-basis: calc\(\(100% - 2 \* var\(--row-gap\)\) \/ 2\.1\);/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*?--card-basis: calc\(\(100% - var\(--row-gap\)\) \/ 1\.1\);/);

  const ws = await tempWorkspace();
  try {
    await fs.mkdir(ws.modelsDir, { recursive: true });
    await writeModel(ws.modelsDir, 'portrait-model', 'Portrait Model', {
      groups: ['Bridal', 'Serial', 'Campaign', 'Short Film', 'Meesho'],
      photos: [
        // Mixed portrait + landscape category -> uniform 2:3 portrait
        { file: 'https://modelportfolio.pages.dev/media/portrait-model/bridal-1.jpg', title: 'Bridal Look 1', category: 'Bridal', width: 1080, height: 1920 },
        { file: 'https://modelportfolio.pages.dev/media/portrait-model/bridal-2.jpg', title: 'Bridal Look 2', category: 'bridal', width: 1440, height: 1080 },
        // All-landscape photo category -> stays landscape (never resized to portrait)
        { file: 'https://modelportfolio.pages.dev/media/portrait-model/camp-1.jpg', title: 'Campaign 1', category: 'Campaign', width: 1600, height: 1067 },
        { file: 'https://modelportfolio.pages.dev/media/portrait-model/camp-2.jpg', title: 'Campaign 2', category: 'Campaign', width: 1600, height: 1067 },
        // All-landscape video + photo category -> both stay landscape with matching frame size
        { file: 'https://modelportfolio.pages.dev/media/portrait-model/film-still.jpg', title: 'Film Still', category: 'Short Film', width: 1920, height: 1080 },
      ],
      videos: [
        // Mixed category with portrait items -> uniform 2:3 frame
        { file: 'https://modelportfolio.pages.dev/media/portrait-model/1-bridal.mov', title: 'Bridal', width: 1080, height: 1920 },
        // Landscape video in a category with NO photos beside it ("Serial") -> keeps natural 1280 / 720 landscape!
        { file: 'https://modelportfolio.pages.dev/media/portrait-model/2-serial.mp4', title: 'Lokkhi Jhanpi', category: 'Serial', width: 1280, height: 720 },
        // Landscape video + landscape photo in "Short Film" -> both stay 1920 / 1080 landscape!
        { file: 'https://modelportfolio.pages.dev/media/portrait-model/3-film.mp4', title: 'Short Film', category: 'Short Film', width: 1920, height: 1080 },
        // Portrait video in a category with NO photos beside it ("Meesho") -> matches uniform 2:3 portrait frame!
        { file: 'https://modelportfolio.pages.dev/media/portrait-model/4-meesho.mp4', title: 'Meesho', width: 720, height: 1280 },
      ],
    });
    await build({ modelsDir: ws.modelsDir, siteDir, outDir: ws.outDir });
    const html = await fs.readFile(path.join(ws.outDir, 'portrait-model', 'index.html'), 'utf8');

    const groupHeadings = [...html.matchAll(/<h3 class="media-group-title">([^<]+)<\/h3>/g)].map((m) => m[1]);
    assert.deepEqual(groupHeadings, ['Bridal', 'Serial', 'Campaign', 'Short Film', 'Meesho']);

    const bridalStart = html.indexOf('data-group="Bridal"');
    const serialStart = html.indexOf('data-group="Serial"');
    const campaignStart = html.indexOf('data-group="Campaign"');
    const shortFilmStart = html.indexOf('data-group="Short Film"');
    const meeshoStart = html.indexOf('data-group="Meesho"');

    // 1. Bridal (has portrait items): NOT is-landscape-row; video gets uniform 2 / 3
    const bridalHtml = html.slice(bridalStart, serialStart);
    assert.match(bridalHtml, /data-media-row data-has-photos="1"/);
    assert.doesNotMatch(bridalHtml, /is-landscape-row/);
    assert.ok(bridalHtml.indexOf('media-card--video') < bridalHtml.indexOf('media-card--photo'));
    assert.match(bridalHtml, /width="2" height="3" data-natural-w="1080" data-natural-h="1920" style="aspect-ratio: 2 \/ 3"/);

    // 2. Serial (landscape video, NO photos beside it): keeps native 1280 / 720 landscape frame!
    const serialHtml = html.slice(serialStart, campaignStart);
    assert.doesNotMatch(serialHtml, /data-has-photos="1"/);
    assert.match(serialHtml, /is-landscape-row/);
    assert.match(serialHtml, /class="media-card media-card--video video-card is-landscape"/);
    assert.match(serialHtml, /width="1280" height="720" data-natural-w="1280" data-natural-h="720" style="aspect-ratio: 1280 \/ 720"/);

    // 3. Campaign (all-landscape photos): marked is-landscape-row with --row-frame-ratio: 1600 / 1067 (not portrait!)
    const campaignHtml = html.slice(campaignStart, shortFilmStart);
    assert.match(campaignHtml, /class="media-row is-landscape-row" data-media-row data-has-photos="1" style="--row-frame-ratio: 1600 \/ 1067"/);

    // 4. Short Film (all-landscape video + photo): both stay 1920 / 1080 landscape!
    const shortFilmHtml = html.slice(shortFilmStart, meeshoStart);
    assert.match(shortFilmHtml, /class="media-row is-landscape-row" data-media-row data-has-photos="1" style="--row-frame-ratio: 1920 \/ 1080"/);
    assert.match(shortFilmHtml, /class="media-card media-card--video video-card is-landscape"/);
    assert.match(shortFilmHtml, /width="1920" height="1080" data-natural-w="1920" data-natural-h="1080" style="aspect-ratio: 1920 \/ 1080"/);

    // 5. Meesho (portrait video, NO photos beside it): matches uniform 2 / 3 portrait frame
    const meeshoHtml = html.slice(meeshoStart);
    assert.doesNotMatch(meeshoHtml, /is-landscape-row/);
    assert.match(meeshoHtml, /width="2" height="3" data-natural-w="720" data-natural-h="1280" style="aspect-ratio: 2 \/ 3"/);
  } finally {
    await ws.cleanup();
  }
});


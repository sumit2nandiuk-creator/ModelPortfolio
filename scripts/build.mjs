#!/usr/bin/env node
// Builds the static site into dist/.
//
// Layout produced:
//   dist/404.html              neutral "not found" page (no model info, no links),
//                              served for "/" and every unknown URL
//   dist/assets/               shared stylesheet + script (contain no model data)
//   dist/<slug>/index.html     one portfolio page per model
//   dist/<slug>/media/...      ONLY the files that model's page references
//
// Because every model is rendered from its own model.json and only its own
// media is copied, a model's URL never exposes another model's content.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { renderModelPage, renderNotFoundPage } from './lib/render.mjs';
import { imageSize } from './lib/image-size.mjs';
import { validateModel, referencedMediaFiles, mediaEntries, isHttpUrl, IMAGE_EXTENSIONS } from './lib/validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export class BuildError extends Error {
  constructor(errors) {
    super(`Build failed with ${errors.length} error(s)`);
    this.name = 'BuildError';
    this.errors = errors;
  }
}

// Folders starting with "_" or "." are templates/hidden and are never published.
async function listModelFolders(modelsDir) {
  const entries = await fs.readdir(modelsDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

// Normalises a base path to the form "/" or "/some/path/".
export function normalizeBasePath(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

export async function build({
  modelsDir = path.join(repoRoot, 'models'),
  siteDir = path.join(repoRoot, 'site'),
  outDir = path.join(repoRoot, 'dist'),
  year = new Date().getFullYear(),
  // Where the site is hosted. "/" for a domain root or custom domain;
  // "/<repo>/" for a GitHub Pages project site. Defaults to SITE_BASE_PATH.
  basePath = process.env.SITE_BASE_PATH,
} = {}) {
  const base = normalizeBasePath(basePath);

  // 1. Read and validate every model before touching the output folder.
  const folders = await listModelFolders(modelsDir);
  const models = [];
  const errors = [];

  for (const folder of folders) {
    const dir = path.join(modelsDir, folder);
    let data;
    try {
      data = JSON.parse(await fs.readFile(path.join(dir, 'model.json'), 'utf8'));
    } catch (err) {
      errors.push(`[${folder}] could not read model.json: ${err.message}`);
      continue;
    }
    const problems = await validateModel(data, { folder, dir });
    errors.push(...problems);
    if (problems.length === 0) models.push({ data, dir });
  }

  if (errors.length) throw new BuildError(errors);

  // 2. Start from a clean output folder.
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.cp(path.join(siteDir, 'assets'), path.join(outDir, 'assets'), { recursive: true });
  // The admin page (protected by its API token; marked noindex). It is optional.
  const adminSrc = path.join(siteDir, 'admin');
  if (await fs.stat(adminSrc).then((s) => s.isDirectory(), () => false)) {
    await fs.cp(adminSrc, path.join(outDir, 'admin'), { recursive: true });
  }

  const notFound = renderNotFoundPage({ base });
  // No index.html on purpose: "/" is a 404 too, so the root reveals nothing.
  await fs.writeFile(path.join(outDir, '404.html'), notFound);
  // Tells GitHub Pages not to run Jekyll over the output.
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');

  // 3. Publish each model in its own isolated folder.
  for (const { data, dir } of models) {
    const slug = data.slug;
    const modelOut = path.join(outDir, slug);
    const mediaOut = path.join(modelOut, 'media');
    await fs.mkdir(mediaOut, { recursive: true });

    const sizes = new Map();
    for (const file of referencedMediaFiles(data)) {
      const source = path.join(dir, 'media', file);
      await fs.copyFile(source, path.join(mediaOut, file));
      if (IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
        sizes.set(file, imageSize(await fs.readFile(source)));
      }
    }
    // Hosted files are not copied; their size comes from the entry's optional width/height.
    for (const entry of mediaEntries(data)) {
      if (isHttpUrl(entry.file) && entry.width && entry.height) {
        sizes.set(entry.file, { width: entry.width, height: entry.height });
      }
    }

    const html = renderModelPage(data, {
      year,
      base,
      // Hosted files (https:// URLs) are used as they are; local files live under this model's media/.
      mediaUrl: (file) => (isHttpUrl(file) ? file : `${base}${slug}/media/${encodeURIComponent(file)}`),
      sizeOf: (file) => sizes.get(file) ?? null,
    });
    await fs.writeFile(path.join(modelOut, 'index.html'), html);
  }

  return models.map((m) => m.data.slug);
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    const slugs = await build();
    const list = slugs.length ? slugs.join(', ') : '(none)';
    console.log(`Built ${slugs.length} model site(s) into dist/: ${list}`);
  } catch (err) {
    if (err instanceof BuildError) {
      console.error('Build failed:');
      for (const e of err.errors) console.error(`  - ${e}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

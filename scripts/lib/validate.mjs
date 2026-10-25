// Validation for a model.json profile and the media it references.
// Returns a list of human-readable error strings (empty when valid).

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { validateTypography } from './fonts.mjs';
import { coverList } from './render.mjs';

export { coverList };

// URL slug = first path segment of the model's page, e.g. /sushmita-ghosh/
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Paths the site itself uses. A model can never take one of these.
export const RESERVED_SLUGS = new Set([
  'assets',
  'media',
  'models',
  'api',
  'admin',
  'static',
  'login',
  'dashboard',
  'index',
  '404',
  'robots.txt',
  'favicon.ico',
  'sitemap.xml',
]);

export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.m4v', '.mov']);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Media references must be bare file names inside the model's media/ folder.
function isSafeFileName(value) {
  return (
    isNonEmptyString(value) &&
    path.basename(value) === value &&
    !value.startsWith('.') &&
    !value.includes('\\')
  );
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function validateModel(model, { folder, dir }) {
  const errors = [];
  const fail = (message) => errors.push(`[${folder}] ${message}`);

  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    fail('model.json must contain a JSON object');
    return errors;
  }

  // --- Identity & URL ---------------------------------------------------
  if (!isNonEmptyString(model.slug)) {
    fail('"slug" is required (it becomes the page URL, e.g. "sushmita-ghosh")');
  } else {
    if (!SLUG_PATTERN.test(model.slug)) {
      fail(`"slug" must use lowercase letters, numbers and single hyphens only (got "${model.slug}")`);
    }
    if (RESERVED_SLUGS.has(model.slug)) {
      fail(`"slug" "${model.slug}" is reserved by the site; choose another`);
    }
    if (model.slug !== folder) {
      fail(`"slug" ("${model.slug}") must match the folder name ("${folder}")`);
    }
  }

  if (!isNonEmptyString(model.name)) fail('"name" is required');

  // --- Text content -------------------------------------------------------
  if (model.bio !== undefined) {
    if (!Array.isArray(model.bio) || !model.bio.every(isNonEmptyString)) {
      fail('"bio" must be an array of non-empty strings (one per paragraph)');
    }
  }

  if (model.stats !== undefined) {
    const ok =
      Array.isArray(model.stats) &&
      model.stats.every((s) => s && isNonEmptyString(s.label) && isNonEmptyString(s.value));
    if (!ok) fail('"stats" must be an array of { "label", "value" } objects');
  }

  if (model.groups !== undefined) {
    if (!Array.isArray(model.groups) || !model.groups.every(isNonEmptyString)) {
      fail('"groups" must be an array of non-empty group title strings');
    }
  }

  // --- Media ---------------------------------------------------------------
  const mediaDir = path.join(dir, 'media');

  // Optional "width" and "height" (whole pixels) let a hosted file reserve its layout space.
  function checkDimensions(entry, where) {
    for (const key of ['width', 'height']) {
      if (entry[key] !== undefined && !(Number.isInteger(entry[key]) && entry[key] > 0)) {
        fail(`${where}.${key} must be a positive whole number of pixels`);
      }
    }
  }

  async function checkMedia(entry, where, allowedExt) {
    if (!entry || typeof entry !== 'object') {
      fail(`${where} must be an object`);
      return;
    }
    // A full https:// URL points at a file hosted elsewhere (for example Cloudflare R2).
    // Those files are not on disk, so only the extension and dimensions are checked.
    if (isHttpUrl(entry.file)) {
      const ext = path.extname(new URL(entry.file).pathname).toLowerCase();
      if (!allowedExt.has(ext)) {
        fail(`${where}.file "${entry.file}" has an unsupported type (allowed: ${[...allowedExt].join(', ')})`);
      }
      checkDimensions(entry, where);
      return;
    }
    if (!isSafeFileName(entry.file)) {
      fail(`${where}.file must be a plain file name inside media/ or an https:// URL (got ${JSON.stringify(entry.file)})`);
      return;
    }
    const ext = path.extname(entry.file).toLowerCase();
    if (!allowedExt.has(ext)) {
      fail(`${where}.file "${entry.file}" has an unsupported type (allowed: ${[...allowedExt].join(', ')})`);
    }
    if (!(await fileExists(path.join(mediaDir, entry.file)))) {
      fail(`${where}.file "${entry.file}" was not found in models/${folder}/media/`);
    }
  }

  async function checkPoster(entry, where) {
    if (entry.poster === undefined) return;
    await checkMedia({ file: entry.poster }, `${where}.poster`, IMAGE_EXTENSIONS);
    checkDimensions({ width: entry.posterWidth, height: entry.posterHeight }, `${where}.poster`);
  }

  // "cover" is the hero slideshow: a list of photos (a single {file, alt} object also works).
  const covers = coverList(model);
  if (!covers.length) {
    fail('"cover" is required (the hero image, or a list of hero images)');
  } else {
    for (const [i, cover] of covers.entries()) {
      const where = Array.isArray(model.cover) ? `cover[${i}]` : 'cover';
      await checkMedia(cover, where, IMAGE_EXTENSIONS);
      if (!isNonEmptyString(cover?.alt)) fail(`"${where}.alt" is required for accessibility`);
    }
  }

  if (model.photos !== undefined) {
    if (!Array.isArray(model.photos)) {
      fail('"photos" must be an array');
    } else {
      for (const [i, photo] of model.photos.entries()) {
        const where = `photos[${i}]`;
        await checkMedia(photo, where, IMAGE_EXTENSIONS);
        if (photo && !isNonEmptyString(photo.title)) fail(`${where}.title is required`);
        if (photo && !isNonEmptyString(photo.category)) fail(`${where}.category is required`);
      }
    }
  }

  if (model.videos !== undefined) {
    if (!Array.isArray(model.videos)) {
      fail('"videos" must be an array');
    } else {
      for (const [i, video] of model.videos.entries()) {
        const where = `videos[${i}]`;
        await checkMedia(video, where, VIDEO_EXTENSIONS);
        await checkPoster(video ?? {}, where);
        if (video && !isNonEmptyString(video.title)) fail(`${where}.title is required`);
      }
    }
  }

  // --- Contact -------------------------------------------------------------
  if (model.contact !== undefined) {
    const c = model.contact;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      fail('"contact" must be an object');
    } else {
      if (c.email !== undefined && !EMAIL_PATTERN.test(c.email)) {
        fail(`"contact.email" is not a valid email address (got "${c.email}")`);
      }
      for (const key of ['phone', 'whatsapp']) {
        if (c[key] === undefined || c[key] === '') continue;
        const value = String(c[key]);
        const digits = value.replace(/\D/g, '');
        if (!/^\+?[0-9 ()-]+$/.test(value) || digits.length < 8) {
          fail(`"contact.${key}" must be a phone number with at least 8 digits (got "${value}")`);
        }
      }
      for (const key of ['instagram', 'linkedin', 'website', 'tiktok', 'imdb']) {
        if (c[key] !== undefined && c[key] !== '' && !isHttpUrl(c[key])) {
          fail(`"contact.${key}" must be a full http(s) URL`);
        }
      }
    }
  }

  for (const fontError of validateTypography(model)) {
    fail(fontError);
  }

  return errors;
}

// Every media entry a model's page uses: covers, photos, videos and video posters.
export function mediaEntries(model) {
  const entries = [];
  for (const cover of coverList(model)) entries.push(cover);
  for (const photo of model.photos ?? []) entries.push(photo);
  for (const video of model.videos ?? []) {
    entries.push(video);
    if (video.poster) entries.push({ file: video.poster, width: video.posterWidth, height: video.posterHeight, thumbnail: video.posterThumbnail, preview: video.posterPreview });
  }
  return entries.filter((e) => e && typeof e.file === 'string');
}

// Every media file a model's page depends on that lives in the model's media/ folder
// (and therefore must be published). Hosted https:// files are not copied.
export function referencedMediaFiles(model) {
  const files = new Set();
  for (const entry of mediaEntries(model)) {
    for (const file of [entry.file, entry.thumbnail, entry.preview]) {
      if (typeof file === 'string' && file && !isHttpUrl(file)) files.add(file);
    }
  }
  return [...files];
}

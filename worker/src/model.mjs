// Pure helpers for the admin Worker: validation, upload rules, storage keys and
// base64 helpers. No Cloudflare or network APIs here, so they are easy to test.

import { validateFonts } from '../../scripts/lib/fonts.mjs';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Kept in step with scripts/lib/validate.mjs.
export const RESERVED_SLUGS = new Set([
  'assets', 'media', 'models', 'api', 'admin', 'static', 'login', 'dashboard',
  'index', '404', 'robots.txt', 'favicon.ico', 'sitemap.xml',
]);

export const IMAGE_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
};
export const VIDEO_TYPES = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/x-m4v',
};

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024; // Workers cap request bodies at 100 MB.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function extensionOf(name) {
  const dot = String(name ?? '').lastIndexOf('.');
  return dot >= 0 ? String(name).slice(dot).toLowerCase() : '';
}

export function contentTypeFor(name) {
  const ext = extensionOf(name);
  return IMAGE_TYPES[ext] || VIDEO_TYPES[ext] || null;
}

// Validates a public /media/<slug>/<file> request path and returns { slug, file, key, contentType } or null.
export function parseMediaPath(pathname) {
  const parts = String(pathname ?? '').split('/').filter(Boolean);
  if (parts.length !== 3 || parts[0] !== 'media') return null;
  let slug;
  let file;
  try {
    slug = decodeURIComponent(parts[1]);
    file = decodeURIComponent(parts[2]);
  } catch {
    return null;
  }
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) return null;
  if (!file || file.includes('/') || file.includes('\\') || file.includes('..') || file.startsWith('.')) {
    return null;
  }
  const contentType = contentTypeFor(file);
  if (!contentType) return null;
  return { slug, file, key: `${slug}/${file}`, contentType };
}

// Parses a single HTTP Range header ("bytes=a-b", "bytes=a-", "bytes=-n") per RFC 9110 §14.1.2.
export function parseByteRange(rangeHeader, size) {
  if (!rangeHeader || typeof rangeHeader !== 'string') return { type: 'none' };
  const raw = rangeHeader.trim();
  if (!raw.startsWith('bytes=') || raw.includes(',')) return { type: 'none' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw);
  if (!match || (!match[1] && !match[2])) return { type: 'none' };
  if (size <= 0) return { type: 'unsatisfiable' };

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { type: 'unsatisfiable' };
    const length = Math.min(suffix, size);
    const offset = size - length;
    return { type: 'range', offset, length, start: offset, end: size - 1 };
  }

  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start >= size) return { type: 'unsatisfiable' };
  let end = size - 1;
  if (match[2]) {
    const requestedEnd = Number(match[2]);
    if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return { type: 'none' };
    end = Math.min(requestedEnd, size - 1);
  }
  return { type: 'range', offset: start, length: end - start + 1, start, end };
}

// Decides whether an uploaded file may be stored. Returns { ok, kind, contentType } or { ok: false, error }.
export function checkUpload({ name, size }) {
  const ext = extensionOf(name);
  if (IMAGE_TYPES[ext]) {
    if (size > MAX_IMAGE_BYTES) return { ok: false, error: 'Images must be 25 MB or smaller.' };
    return { ok: true, kind: 'image', contentType: IMAGE_TYPES[ext] };
  }
  if (VIDEO_TYPES[ext]) {
    if (size > MAX_VIDEO_BYTES) return { ok: false, error: 'Videos must be 95 MB or smaller.' };
    return { ok: true, kind: 'video', contentType: VIDEO_TYPES[ext] };
  }
  return { ok: false, error: 'Unsupported file type. Use JPG, PNG, WebP, AVIF, MP4, WebM or M4V.' };
}

// A storage key that starts with the model slug, so one model's uploads never mix with another's.
export function mediaKeyFor(slug, fileName, nowMs, randomId) {
  const ext = extensionOf(fileName);
  const base = String(fileName).slice(0, String(fileName).length - ext.length)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file';
  return `${slug}/${nowMs}-${randomId}-${base}${ext}`;
}

// Returns the storage key for a public URL, or null if the URL is not inside this model's folder.
export function keyFromPublicUrl(url, publicBase, slug) {
  const base = String(publicBase ?? '').replace(/\/+$/, '');
  if (!base || typeof url !== 'string' || !url.startsWith(`${base}/`)) return null;
  let key;
  try {
    key = decodeURIComponent(url.slice(base.length + 1));
  } catch {
    return null;
  }
  if (!key.startsWith(`${slug}/`) || key.includes('..') || key.includes('\\')) return null;
  return key;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

// A media reference is either a plain file name in the model's media/ folder or an http(s) URL.
function validMediaRef(file) {
  if (!nonEmpty(file)) return false;
  if (isHttpUrl(file)) return true;
  return !file.includes('/') && !file.includes('\\') && !file.startsWith('.');
}

// Checks the shape of a model.json before it is committed. The build still checks
// that local files exist; this catches mistakes early in the admin.
export function validateModelShape(model, slug) {
  const errors = [];
  const fail = (m) => errors.push(m);

  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    return ['The profile must be an object.'];
  }
  if (!nonEmpty(model.slug)) fail('"slug" is required.');
  else if (!SLUG_PATTERN.test(model.slug)) fail('"slug" may only use lowercase letters, numbers and single hyphens.');
  else if (RESERVED_SLUGS.has(model.slug)) fail(`"slug" "${model.slug}" is reserved.`);
  if (slug !== undefined && model.slug !== slug) fail(`"slug" must stay "${slug}".`);

  if (!nonEmpty(model.name)) fail('"name" is required.');
  if (model.tagline !== undefined && typeof model.tagline !== 'string') fail('"tagline" must be text.');

  if (model.bio !== undefined && (!Array.isArray(model.bio) || !model.bio.every(nonEmpty))) {
    fail('"bio" must be a list of paragraphs.');
  }
  if (model.stats !== undefined) {
    const ok = Array.isArray(model.stats) && model.stats.every((s) => s && nonEmpty(s.label) && nonEmpty(s.value));
    if (!ok) fail('"stats" must be a list of label and value pairs.');
  }

  const covers = Array.isArray(model.cover) ? model.cover : model.cover ? [model.cover] : [];
  if (!covers.length) fail('At least one cover photo is required.');
  covers.forEach((c, i) => {
    if (!c || !validMediaRef(c.file)) fail(`Cover photo ${i + 1} needs a file.`);
    if (!nonEmpty(c?.alt)) fail(`Cover photo ${i + 1} needs alt text.`);
  });

  if (model.photos !== undefined) {
    if (!Array.isArray(model.photos)) fail('"photos" must be a list.');
    else {
      model.photos.forEach((p, i) => {
        if (!p || !validMediaRef(p.file)) fail(`Photo ${i + 1} needs a file.`);
        if (!nonEmpty(p?.title)) fail(`Photo ${i + 1} needs a title.`);
        if (!nonEmpty(p?.category)) fail(`Photo ${i + 1} needs a category.`);
      });
    }
  }

  if (model.videos !== undefined) {
    if (!Array.isArray(model.videos)) fail('"videos" must be a list.');
    else {
      model.videos.forEach((v, i) => {
        if (!v || !validMediaRef(v.file)) fail(`Video ${i + 1} needs a file.`);
        if (!nonEmpty(v?.title)) fail(`Video ${i + 1} needs a title.`);
        if (v && v.poster !== undefined && !validMediaRef(v.poster)) fail(`Video ${i + 1} has an invalid poster.`);
      });
    }
  }

  if (model.contact !== undefined) {
    const c = model.contact;
    if (!c || typeof c !== 'object' || Array.isArray(c)) fail('"contact" must be an object.');
    else {
      if (c.email && !EMAIL_PATTERN.test(c.email)) fail('The email address is not valid.');
      for (const key of ['phone', 'whatsapp']) {
        if (!c[key]) continue;
        const digits = String(c[key]).replace(/\D/g, '');
        if (!/^\+?[0-9 ()-]+$/.test(String(c[key])) || digits.length < 8) {
          fail(`"${key}" must be a phone number with at least 8 digits.`);
        }
      }
      for (const key of ['instagram', 'linkedin', 'website', 'tiktok', 'imdb']) {
        if (c[key] && !isHttpUrl(c[key])) fail(`"${key}" must be a full https:// link.`);
      }
    }
  }
  for (const fontError of validateFonts(model.fonts)) {
    fail(fontError);
  }
  return errors;
}

export function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToUtf8(encoded) {
  const binary = atob(String(encoded).replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function constantTimeEqual(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

export function bearerToken(request) {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

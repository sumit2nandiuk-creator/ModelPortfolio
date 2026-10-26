// HTML rendering for a single model's portfolio page and the neutral pages.
// Pure runtime-agnostic JavaScript (zero Node.js imports) so it runs identically
// during static builds and inside Cloudflare Pages Functions / Workers.
// Each call only ever receives ONE model's data, so a page can never contain
// another model's name, photos or links.

import {
  DEFAULT_TEXTS,
  fontStyleVarsFor,
  googleFontsHrefFor,
  renderRuns,
  splitNameRuns,
} from './fonts.mjs';

export function coverList(model) {
  if (Array.isArray(model?.cover)) return model.cover;
  return model?.cover ? [model.cover] : [];
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function dimensionAttrs(size) {
  return size ? ` width="${size.width}" height="${size.height}"` : '';
}

function imageVariants(entry, ctx, format) {
  return (Array.isArray(entry.variants) ? entry.variants : [])
    .filter(v => v && v.format === format && v.file && v.width > 0)
    .sort((a, b) => a.width - b.width)
    .map(v => ({ ...v, url: ctx.mediaUrl(v.file) }));
}

function imageSource(entry, ctx) {
  const webp = imageVariants(entry, ctx, 'webp');
  const avif = imageVariants(entry, ctx, 'avif');
  if (webp.length) {
    const initial = webp.find(v => v.width >= 960) || webp.at(-1);
    return { src: initial.url, full: webp.at(-1).url, thumb: '', preview: '', webp, avif };
  }
  const full = ctx.mediaUrl(entry.file);
  const thumb = entry.thumbnail ? ctx.mediaUrl(entry.thumbnail) : '';
  const preview = entry.preview ? ctx.mediaUrl(entry.preview) : '';
  return { src: preview || thumb || full, full, thumb, preview };
}

function variantSet(variants) {
  return variants.map(v => `${v.url} ${v.width}w`).join(', ');
}

function responsiveImage(source, markup, hero = false) {
  if (!source.webp?.length) return markup;
  const sizes = hero ? '100vw' : '(max-width: 600px) 75vw, (max-width: 1000px) 45vw, 360px';
  const img = markup.replace('<img ', `<img srcset="${esc(variantSet(source.webp))}" sizes="${sizes}" `);
  return `<picture>${source.avif.length ? `<source type="image/avif" srcset="${esc(variantSet(source.avif))}" sizes="${sizes}">` : ''}${img}</picture>`;
}

function viewerAttrs(source) {
  if (!source.webp?.length) return '';
  return ` data-viewer-webp="${esc(variantSet(source.webp))}" data-viewer-avif="${esc(variantSet(source.avif))}"`;
}

function progressiveAttrs(source) {
  if (source.webp?.length) return '';
  const attrs = [];
  if (source.preview && source.thumb) attrs.push(`data-medium-src="${esc(source.thumb)}"`);
  if (source.preview || source.thumb) attrs.push(`data-full-src="${esc(source.full)}"`);
  return attrs.length ? ` ${attrs.join(' ')}` : '';
}

function uniqueInOrder(values) {
  return [...new Set(values)];
}

// Which optional sections a profile actually has. Navigation and buttons only
// link to sections that are rendered, so no link can point at nothing.
function hasContact(model) {
  const c = model.contact ?? {};
  return Boolean(
    c.email || c.phone || c.whatsapp ||
      c.instagram || c.linkedin || c.tiktok || c.imdb || c.website,
  );
}

function sectionsFor(model) {
  return {
    about: (model.bio ?? []).length > 0 || (model.stats ?? []).length > 0,
    portfolio: (model.photos ?? []).length > 0 || (model.videos ?? []).length > 0,
    contact: hasContact(model),
  };
}

// Shared <head> pieces for every generated page.
function documentShell({
  title,
  description = '',
  body,
  bodyClass = '',
  bodyStyle = '',
  fontsHref = googleFontsHrefFor(),
  extraHead = '',
  robots = 'index,follow',
  base = '/',
}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  ${description ? `<meta name="description" content="${esc(description)}">` : ''}
  <meta name="robots" content="${esc(robots)}">
  <link rel="icon" href="data:,">
  ${extraHead}
  <link rel="preload" href="${esc(base)}assets/fonts/cormorant-garamond-latin-400-italic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="dns-prefetch" href="https://fonts.googleapis.com">
  <link rel="dns-prefetch" href="https://fonts.gstatic.com">
  <link rel="stylesheet" href="${esc(fontsHref)}">
  <script>if('scrollRestoration' in history)history.scrollRestoration='manual';if(location.hash)history.replaceState(null,'',location.pathname+location.search);</script>
  <link rel="stylesheet" href="${esc(base)}assets/site.css">
</head>
<body class="${esc(bodyClass)}"${bodyStyle ? ` style="${esc(bodyStyle)}"` : ''}>
${body}
</body>
</html>
`;
}

// Neutral page used for "/" and for unknown URLs. It deliberately carries no
// model information and no links to any model.
export function renderNotFoundPage({ base = '/' } = {}) {
  return documentShell({
    title: 'Page not found',
    robots: 'noindex,nofollow',
    base,
    bodyClass: 'empty-page',
    body: `<main class="empty"><p class="eyebrow">404</p><h1>Page not found</h1></main>`,
  });
}

// Splits "Sushmita Ghosh" into a given name and a family name so the header
// can show them as a two-line lockup. A single word becomes only a given name.
export function splitName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { given: parts[0] ?? '', family: '' };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
}

function renderTextOrRuns(model, key) {
  const runs = model.richText?.[key];
  if (Array.isArray(runs) && runs.length) return renderRuns(runs);
  const custom = model.texts?.[key];
  return esc(typeof custom === 'string' && custom.trim() ? custom : DEFAULT_TEXTS[key]);
}

function renderBrandLockup(model) {
  const nameRuns = model.richText?.name;
  if (Array.isArray(nameRuns) && nameRuns.length) {
    const { givenRuns, familyRuns } = splitNameRuns(nameRuns);
    return `<span class="brand-given">${renderRuns(givenRuns)}</span>${
      familyRuns.length
        ? `\n      <span class="brand-family">${renderRuns(familyRuns)}</span>`
        : ''
    }`;
  }
  const { given, family } = splitName(model.name);
  return `<span class="brand-given">${esc(given)}</span>${
    family ? `\n      <span class="brand-family">${esc(family)}</span>` : ''
  }`;
}

function renderHeader(model, available) {
  const links = [
    ['about', 'About'],
    ['portfolio', 'Portfolio'],
    ['contact', 'Contact'],
  ]
    .filter(([key]) => available[key])
    .map(([key, label]) => `<a href="#${key}">${label}</a>`)
    .join('\n      ');

  return `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="#top" aria-label="${esc(model.name)} – back to top">
      ${renderBrandLockup(model)}
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
      <span class="nav-toggle-bars" aria-hidden="true"></span>
      <span class="sr-only">Menu</span>
    </button>
    <nav id="site-nav" class="site-nav" aria-label="Primary">
      ${links}
    </nav>
  </header>`;
}

function renderHero(model, ctx) {
  const covers = coverList(model);
  const many = covers.length > 1;

  // One slide per cover photo. A tap opens the viewer; a drag moves the slides instead.
  const slides = covers
    .map((cover, i) => {
      // Never use the tiny preview for an above-the-fold hero.
      const source = imageSource({ ...cover, preview: undefined }, ctx);
      const thumb = cover.thumbnail ? ctx.mediaUrl(cover.thumbnail) : '';
      const display = thumb ? { src: thumb, full: source.full, thumb, preview: '' } : source;
      const upgrade = thumb && source.webp?.length
        ? ` data-full-webp="${esc(variantSet(source.webp))}" data-full-avif="${esc(variantSet(source.avif))}"`
        : '';
      const src = source.full;
      const label = many ? `Open cover photo ${i + 1} of ${covers.length}` : 'Open cover photo';
      return `
        <button class="carousel-slide" type="button" data-src="${esc(src)}"${viewerAttrs(source)}${(source.thumb || source.preview) ? ` data-thumb="${esc(source.thumb || source.preview)}"` : ''} data-alt="${esc(cover.alt)}" data-caption="" aria-label="${esc(label)}">
          ${responsiveImage(display, `<img class="hero-media" src="${esc(display.src)}"${progressiveAttrs(display)}${upgrade} alt="${esc(cover.alt)}"${dimensionAttrs(ctx.sizeOf(cover.file))} loading="eager" fetchpriority="high" decoding="async" draggable="false">`, true)}
        </button>`;
    })
    .join('');

  const dots = many
    ? `
      <div class="carousel-dots">
        ${covers
          .map(
            (_, i) =>
              `<button class="carousel-dot${i === 0 ? ' is-active' : ''}" type="button" data-goto="${i}" aria-label="Show cover photo ${i + 1}"></button>`,
          )
          .join('\n        ')}
      </div>`
    : '';

  return `
    <section class="hero" aria-labelledby="hero-title">
      <div class="carousel hero-carousel" role="region" aria-roledescription="carousel" aria-label="Cover photos" data-autoplay="${many ? 6000 : 0}">${slides}
      </div>
      <span class="hero-shade" aria-hidden="true"></span>
      <h1 id="hero-title" class="sr-only">${esc(model.name)}</h1>${dots}
    </section>`;
}

function statSpanClass(stat) {
  const labelLen = String(stat?.label ?? '').trim().length;
  const valLen = String(stat?.value ?? '').trim().length;
  if (valLen > 20 || labelLen + valLen > 28) return ' stat--full';
  if (valLen > 12 || labelLen > 12) return ' stat--span-2';
  return '';
}

function renderAbout(model) {
  const bio = model.bio ?? [];
  const stats = model.stats ?? [];
  if (!bio.length && !stats.length) return '';
  const richBio = Array.isArray(model.richText?.bio) ? model.richText.bio : null;
  const statsCountClass = stats.length === 1 ? ' stats--count-1' : stats.length === 2 ? ' stats--count-2' : '';
  return `
    <section id="about" class="section about" aria-labelledby="about-title">
      <div class="container about-grid">
        <div class="about-text reveal">
          <p id="about-title" class="eyebrow">${renderTextOrRuns(model, 'aboutLabel')}</p>
          ${bio
            .map((p, i) => {
              const richPara = richBio && Array.isArray(richBio[i]) && richBio[i].length ? renderRuns(richBio[i]) : esc(p);
              return `<p class="lead">${richPara}</p>`;
            })
            .join('\n          ')}
        </div>
        ${
          stats.length
            ? `<aside class="about-stats reveal" aria-label="Measurements and details">
          <dl class="stats${statsCountClass}">
            ${stats.map((s) => `<div class="stat${statSpanClass(s)}"><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('\n            ')}
          </dl>
        </aside>`
            : ''
        }
      </div>
    </section>`;
}

function videoDimensions(video, ctx) {
  if (video.width && video.height) return { width: video.width, height: video.height };
  const fromFile = video.file ? ctx.sizeOf(video.file) : null;
  if (fromFile?.width && fromFile?.height) return fromFile;
  if (video.posterWidth && video.posterHeight) return { width: video.posterWidth, height: video.posterHeight };
  const fromPoster = video.poster ? ctx.sizeOf(video.poster) : null;
  if (fromPoster?.width && fromPoster?.height) return fromPoster;
  return null;
}

function photoDimensions(photo, ctx) {
  if (photo?.width && photo?.height) return { width: photo.width, height: photo.height };
  const fromFile = photo?.file ? ctx.sizeOf(photo.file) : null;
  if (fromFile?.width && fromFile?.height) return fromFile;
  return null;
}

const UNIFORM_PHOTO_FRAME = { width: 2, height: 3 };

// Computes a uniform landscape frame when every item in a category is landscape (width > height).
// Preserves exact aspect ratio when all items share the same ratio, or uses the clamped median ratio.
export function landscapeFrameForDims(dims) {
  if (!dims.length) return { width: 3, height: 2 };
  if (dims.length === 1) return { width: dims[0].width, height: dims[0].height };
  const ratios = dims.map((d) => d.width / d.height).sort((a, b) => a - b);
  if (ratios[ratios.length - 1] - ratios[0] <= 0.02) {
    return { width: dims[0].width, height: dims[0].height };
  }
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 === 1 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  const clamped = Math.min(2.2, Math.max(1.25, median));
  return { width: Math.round(clamped * 1000), height: 1000 };
}

// Groups a model's videos and photos by title/category (case-insensitively),
// preserving explicit `model.groups` order first and placing all videos before
// photos inside every group row.
export function groupPortfolioMedia(model) {
  const byKey = new Map();
  const order = [];

  function ensureGroup(rawName) {
    const label = String(rawName ?? '').trim() || 'Portfolio';
    const key = label.toLowerCase();
    let group = byKey.get(key);
    if (!group) {
      group = { key, title: label, videos: [], photos: [] };
      byKey.set(key, group);
      order.push(group);
    }
    return group;
  }

  for (const g of model?.groups ?? []) {
    if (typeof g === 'string' && g.trim()) ensureGroup(g);
  }
  for (const video of model?.videos ?? []) {
    if (!video || !video.file) continue;
    const name = String(video.category || video.title || 'Portfolio').trim();
    ensureGroup(name).videos.push(video);
  }
  for (const photo of model?.photos ?? []) {
    if (!photo || !photo.file) continue;
    const name = String(photo.category || photo.title || 'Portfolio').trim();
    ensureGroup(name).photos.push(photo);
  }

  return order.filter((g) => g.videos.length > 0 || g.photos.length > 0);
}

function renderPortfolio(model, ctx) {
  const groups = groupPortfolioMedia(model);
  if (!groups.length) return '';

  const filters =
    groups.length > 1
      ? `
        <div class="filters" role="group" aria-label="Filter portfolio by category">
          <button class="filter is-active" type="button" data-filter="all" aria-pressed="true">All</button>
          ${groups
            .map((g) => `<button class="filter" type="button" data-filter="${esc(g.title)}" aria-pressed="false">${esc(g.title)}</button>`)
            .join('\n          ')}
        </div>`
      : '';

  const hasAnyPhotos = (model.photos ?? []).length > 0;

  let photoIndex = 0;
  const groupSections = groups
    .map((group) => {
      const totalItems = group.videos.length + group.photos.length;
      const groupHasPhotos = group.photos.length > 0;
      const videoDims = group.videos.map((v) => videoDimensions(v, ctx));
      const photoDims = group.photos.map((p) => photoDimensions(p, ctx));
      const allDims = [...videoDims, ...photoDims];
      const knownDims = allDims.filter(Boolean);
      const isAllLandscapeGroup =
        allDims.length > 0 &&
        knownDims.length === allDims.length &&
        knownDims.every((d) => d.width > d.height);
      const hasKnownNonLandscape = knownDims.some((d) => d.width <= d.height);
      const rowLandscapeFrame = isAllLandscapeGroup && groupHasPhotos ? landscapeFrameForDims(knownDims) : null;

      const videoCards = group.videos
        .map((video, vIdx) => {
          const nativeDim = videoDims[vIdx];
          let frameDim = null;
          if (isAllLandscapeGroup) {
            // Every item in this category is landscape: never resize to portrait.
            // Match the uniform landscape row frame when photos sit beside the video; keep native ratio otherwise.
            frameDim = groupHasPhotos ? rowLandscapeFrame : nativeDim;
          } else if (groupHasPhotos) {
            // Confirmed portrait/mixed category (or fallback while unknown items load via CSS --row-frame-ratio).
            if (hasKnownNonLandscape) frameDim = UNIFORM_PHOTO_FRAME;
          } else if (nativeDim && nativeDim.width > nativeDim.height) {
            frameDim = nativeDim;
          } else if (nativeDim && nativeDim.height >= nativeDim.width) {
            frameDim = hasAnyPhotos ? UNIFORM_PHOTO_FRAME : nativeDim;
          }
          const isPortrait = frameDim ? frameDim.height > frameDim.width : false;
          const isLandscape = frameDim ? frameDim.width >= frameDim.height : false;
          const cardClass = `media-card media-card--video video-card${isPortrait ? ' is-portrait' : isLandscape ? ' is-landscape' : ''}`;
          const videoStyle = frameDim ? ` style="aspect-ratio: ${frameDim.width} / ${frameDim.height}"` : '';
          const sizeAttrs = frameDim ? ` width="${frameDim.width}" height="${frameDim.height}"` : '';
          const naturalAttrs = nativeDim ? ` data-natural-w="${nativeDim.width}" data-natural-h="${nativeDim.height}"` : '';
          const posterUrl = video.poster ? ctx.mediaUrl(video.poster) : '';
          const posterThumb = video.posterThumbnail ? ctx.mediaUrl(video.posterThumbnail) : '';
          const poster = posterUrl
            ? ` poster="${esc(posterThumb || posterUrl)}"${posterThumb ? ` data-full-poster="${esc(posterUrl)}"` : ''}`
            : '';
          const preload = 'none';
          const rawSrc = ctx.mediaUrl(video.file);
          const videoSrc = rawSrc;
          const vTitle = String(video.title ?? '').trim();
          const showSubTitle = vTitle && vTitle.toLowerCase() !== group.title.toLowerCase();
          const hasCaption = Boolean(showSubTitle || video.description);
          return `
              <figure class="${cardClass}" data-category="${esc(group.title)}">
                <div class="video-frame">
                  <video controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsinline preload="${preload}"${poster}${sizeAttrs}${naturalAttrs}${videoStyle} data-video-src="${esc(videoSrc)}" aria-label="${esc(vTitle || group.title)}"></video>
                  <button type="button" class="video-play-button" aria-label="Play ${esc(vTitle || group.title)}">▶</button>
                </div>${
                  hasCaption
                    ? `
                <figcaption class="media-caption">
                  ${showSubTitle ? `<h4 class="video-title">${esc(vTitle)}</h4>` : ''}
                  ${video.description ? `<p class="video-desc">${esc(video.description)}</p>` : ''}
                </figcaption>`
                    : ''
                }
              </figure>`;
        })
        .join('');

      const photoCards = group.photos
        .map((photo, pIdx) => {
          const i = photoIndex++;
          const pDim = photoDims[pIdx];
          const source = imageSource(photo, ctx);
          const src = source.full;
          const alt = photo.alt || photo.title || group.title;
          const caption = group.title;
          const label = [group.title, photo.title].filter(Boolean).join(' · ');
          return `
              <figure class="media-card media-card--photo gallery-item" data-category="${esc(group.title)}">
                <button class="gallery-btn" type="button" data-index="${i}" data-src="${esc(src)}"${viewerAttrs(source)}${(source.thumb || source.preview) ? ` data-thumb="${esc(source.thumb || source.preview)}"` : ''} data-alt="${esc(alt)}" data-caption="${esc(caption)}" aria-label="Open photo: ${esc(label)}">
                  ${responsiveImage(source, `<img src="${esc(source.src)}"${progressiveAttrs(source)} alt="${esc(alt)}"${dimensionAttrs(pDim)} loading="lazy" decoding="async" draggable="false">`)}
                </button>${
                  photo.year
                    ? `
                <figcaption class="gallery-caption">
                  <span class="gallery-year">${esc(photo.year)}</span>
                </figcaption>`
                    : ''
                }
              </figure>`;
        })
        .join('');

      const navButtons =
        totalItems > 1
          ? `
              <div class="media-row-nav">
                <button class="row-arrow row-arrow--prev" type="button" data-row-dir="-1" aria-label="Scroll ${esc(group.title)} left">‹</button>
                <button class="row-arrow row-arrow--next" type="button" data-row-dir="1" aria-label="Scroll ${esc(group.title)} right">›</button>
              </div>`
          : '';

      const rowClass = `media-row${totalItems < 2 ? ' is-single' : ''}${isAllLandscapeGroup ? ' is-landscape-row' : ''}`;
      const rowStyle = rowLandscapeFrame ? ` style="--row-frame-ratio: ${rowLandscapeFrame.width} / ${rowLandscapeFrame.height}"` : '';

      return `
          <section class="media-group reveal" data-group="${esc(group.title)}" aria-label="${esc(group.title)}">
            <div class="media-group-head">
              <h3 class="media-group-title">${esc(group.title)}</h3>${navButtons}
            </div>
            <div class="${rowClass}" data-media-row${groupHasPhotos ? ' data-has-photos="1"' : ''}${rowStyle}>${videoCards}${photoCards}
            </div>
          </section>`;
    })
    .join('\n');

  const labelHtml = renderTextOrRuns(model, 'portfolioLabel');

  const headerHtml = labelHtml
    ? `\n        <header class="section-head reveal">
          <p id="portfolio-label" class="eyebrow">${labelHtml}</p>
        </header>`
    : '';

  const labelAttr = labelHtml ? ' aria-labelledby="portfolio-label"' : ' aria-label="Portfolio"';

  return `
    <section id="portfolio" class="section section-alt"${labelAttr}>
      <div class="container">${headerHtml}
        ${filters}
        <div class="portfolio-groups">${groupSections}
        </div>
      </div>
    </section>`;
}

// Line icons for the contact cards. Stroke-based so they inherit colour from CSS.
const CONTACT_ICONS = {
  mail: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7.5l8 5.5 8-5.5"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
};

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function contactCard({ href, icon, label, value, variant = '', external = false }) {
  const extra = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `
          <a class="contact-item${variant ? ` contact-item--${variant}` : ''}" href="${esc(href)}"${extra}>
            <span class="contact-icon">${icon}</span>
            <span class="contact-text">
              <span class="contact-label">${esc(label)}</span>
              <span class="contact-value">${esc(value)}</span>
            </span>
          </a>`;
}

function renderContact(model) {
  const c = model.contact ?? {};
  if (!hasContact(model)) return '';

  const socials = [
    ['Instagram', c.instagram],
    ['LinkedIn', c.linkedin],
    ['TikTok', c.tiktok],
    ['IMDb', c.imdb],
    ['Website', c.website],
  ].filter(([, url]) => url);

  const cards = [];
  if (c.email) {
    cards.push(contactCard({ href: `mailto:${c.email}`, icon: CONTACT_ICONS.mail, label: 'Email', value: c.email }));
  }
  if (c.phone) {
    cards.push(contactCard({ href: `tel:+${digitsOnly(c.phone)}`, icon: CONTACT_ICONS.phone, label: 'Phone', value: c.phone }));
  }

  const customContactRuns = model.richText?.contactHeading;
  const customContactText = model.texts?.contactHeading;
  const contactHeadingHtml =
    Array.isArray(customContactRuns) && customContactRuns.length
      ? renderRuns(customContactRuns)
      : typeof customContactText === 'string' && customContactText.trim()
        ? esc(customContactText)
        : 'Let’s create something <em>beautiful</em> together.';

  return `
    <section id="contact" class="section contact" aria-labelledby="contact-title">
      <div class="container">
        <div class="contact-head reveal">
          <p class="eyebrow">${renderTextOrRuns(model, 'contactLabel')}</p>
          <h2 id="contact-title" class="contact-heading">${contactHeadingHtml}</h2>
        </div>
        ${cards.length ? `<div class="contact-items reveal">${cards.join('')}
        </div>` : ''}
        ${
          socials.length
            ? `<ul class="contact-socials reveal">
          ${socials
            .map(
              ([label, url]) =>
                `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></li>`,
            )
            .join('\n          ')}
        </ul>`
            : ''
        }
      </div>
    </section>`;
}

function renderFooter(model, year) {
  return `
  <footer class="site-footer">
    <div class="container footer-inner">
      <p>© ${esc(year)} ${esc(model.name)}. All rights reserved.</p>
      <a href="#top">Back to top ↑</a>
    </div>
  </footer>`;
}

// Official WhatsApp logo mark: outer white speech-bubble border, WhatsApp brand-green
// (#25D366) speech-bubble interior, and white phone handset.
const WHATSAPP_GLYPH = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#fff" d="m 20.463,3.488 A 11.815,11.815 0 0,0 12.05,0 C 5.495,0 0.16,5.335 0.157,11.892 c 0,2.096 0.547,4.142 1.588,5.945 L 0.057,24 l 6.305,-1.654 a 11.882,11.882 0 0,0 5.683,1.448 l 0.005,0 c 6.554,0 11.89,-5.335 11.893,-11.893 a 11.821,11.821 0 0,0 -3.48,-8.413 Z"/><path fill="#25D366" d="M 12.05,21.785 h -0.004 a 9.87,9.87 0 0,1 -5.031,-1.378 l -0.361,-0.214 -3.741,0.982 0.998,-3.648 -0.235,-0.374 a 9.86,9.86 0 0,1 -1.51,-5.26 c 0.002,-5.45 4.436,-9.884 9.888,-9.884 2.64,0 5.122,1.03 6.988,2.898 a 9.825,9.825 0 0,1 2.893,6.994 c -0.003,5.45 -4.437,9.884 -9.885,9.884 Z"/><path fill="#fff" d="M 17.472,14.382 c -0.297,-0.149 -1.758,-0.867 -2.03,-0.967 c -0.273,-0.099 -0.471,-0.148 -0.67,0.15 c -0.197,0.297 -0.767,0.966 -0.94,1.164 c -0.173,0.199 -0.347,0.223 -0.644,0.075 c -0.297,-0.15 -1.255,-0.463 -2.39,-1.475 c -0.883,-0.788 -1.48,-1.761 -1.653,-2.059 c -0.173,-0.297 -0.018,-0.458 0.13,-0.606 c 0.134,-0.133 0.298,-0.347 0.446,-0.52 c 0.149,-0.174 0.198,-0.298 0.298,-0.497 c 0.099,-0.198 0.05,-0.371 -0.025,-0.52 c -0.075,-0.149 -0.669,-1.612 -0.916,-2.207 c -0.242,-0.579 -0.487,-0.5 -0.669,-0.51 c -0.173,-0.008 -0.371,-0.01 -0.57,-0.01 c -0.198,0 -0.52,0.074 -0.792,0.372 c -0.272,0.297 -1.04,1.016 -1.04,2.479 c 0,1.462 1.065,2.875 1.213,3.074 c 0.149,0.198 2.096,3.2 5.077,4.487 c 0.709,0.306 1.262,0.489 1.694,0.625 c 0.712,0.227 1.36,0.195 1.871,0.118 c 0.571,-0.085 1.758,-0.719 2.006,-1.413 c 0.248,-0.694 0.248,-1.289 0.173,-1.413 c -0.074,-0.124 -0.272,-0.198 -0.57,-0.347 Z"/></svg>`;

// A small WhatsApp logo button in the bottom-right corner. Shown only when a WhatsApp number is set.
function renderWhatsAppFloat(model) {
  const number = model.contact?.whatsapp;
  if (!number) return '';
  return `
  <a class="whatsapp-float" href="https://wa.me/${esc(digitsOnly(number))}" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">${WHATSAPP_GLYPH}</a>`;
}

function renderLightbox() {
  return `
  <dialog id="lightbox" class="lightbox" aria-label="Photo viewer">
    <div class="lb-inner">
      <button class="lb-btn lb-close" type="button" aria-label="Close photo viewer">✕</button>
      <button class="lb-btn lb-prev" type="button" aria-label="Previous photo">‹</button>
      <div id="lb-stage" class="carousel lb-stage" role="region" aria-roledescription="carousel" aria-label="Photos"></div>
      <button class="lb-btn lb-next" type="button" aria-label="Next photo">›</button>
      <p id="lb-caption" class="lb-caption" hidden></p>
    </div>
  </dialog>`;
}

// The single model page. `ctx` provides:
//   base           -> site base path, e.g. "/" or "/ModelPortfolio/"
//   mediaUrl(file) -> public URL of a media file for THIS model
//   sizeOf(file)   -> { width, height } or null
//   year           -> footer year
export function renderModelPage(model, ctx) {
  // The tagline is optional. When it is set, it follows the name in the page title.
  const title = model.tagline ? `${model.name} · ${model.tagline}` : model.name;
  const description = model.seo?.description || model.tagline || '';
  const covers = coverList(model);
  const firstCover = covers[0];
  const cover = firstCover ? ctx.mediaUrl(firstCover.file) : '';

  const remoteOrigins = new Set();
  const registerRemoteOrigin = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    if (rawUrl.startsWith('https://') || rawUrl.startsWith('http://')) {
      try {
        remoteOrigins.add(new URL(rawUrl).origin);
      } catch (_) {}
    }
  };
  for (const coverEntry of covers) {
    if (coverEntry?.file) registerRemoteOrigin(ctx.mediaUrl(coverEntry.thumbnail || coverEntry.file));
  }
  for (const p of model.photos ?? []) {
    if (p.file) registerRemoteOrigin(ctx.mediaUrl(p.file));
  }
  for (const v of model.videos ?? []) {
    if (v.file) registerRemoteOrigin(ctx.mediaUrl(v.file));
    if (v.poster) registerRemoteOrigin(ctx.mediaUrl(v.poster));
  }

  const preconnectTags = [...remoteOrigins]
    .map(
      (origin) =>
        `<link rel="preconnect" href="${esc(origin)}" crossorigin>\n  <link rel="dns-prefetch" href="${esc(origin)}">`,
    )
    .join('\n  ');

  // Preload the first hero image from <head>; all slides are eager/high in markup.
  const coverPreloads = covers
    .slice(0, 1)
    .map((c, i) => {
      if (c.thumbnail) {
        return `<link rel="preload" as="image" href="${esc(ctx.mediaUrl(c.thumbnail))}" fetchpriority="high">`;
      }
      const responsive = imageSource({ ...c, preview: undefined }, ctx);
      if (responsive.webp?.length) {
        // Preload AVIF only: WebP browsers discover their fallback in <picture>.
        const variants = responsive.avif;
        if (!variants.length) return '';
        return `<link rel="preload" as="image" type="image/avif" href="${esc(variants.at(-1).url)}" imagesrcset="${esc(variantSet(variants))}" imagesizes="100vw" fetchpriority="high">`;
      }
      const url = ctx.mediaUrl(c.file);
      if (!url) return '';
      return `<link rel="preload" as="image" href="${esc(url)}"${i === 0 ? ' fetchpriority="high"' : ''}>`;
    })
    .filter(Boolean)
    .join('\n  ');

  const extraHead = [
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:type" content="profile">`,
    cover ? `<meta property="og:image" content="${esc(cover)}">` : '',
    preconnectTags,
    coverPreloads,
  ]
    .filter(Boolean)
    .join('\n  ');

  const available = sectionsFor(model);
  const body = `<div id="top" class="top-anchor" aria-hidden="true"></div>
  ${renderHeader(model, available)}
  <main id="main">
    ${renderHero(model, ctx)}
    ${renderAbout(model)}
    ${renderPortfolio(model, ctx)}
    ${renderContact(model)}
  </main>
  ${renderFooter(model, ctx.year)}
  ${renderLightbox()}
  ${renderWhatsAppFloat(model)}
  <script src="${esc(ctx.base)}assets/error-reporting.js" defer></script>
  <script src="${esc(ctx.base)}assets/site.js" defer></script>`;

  return documentShell({
    title,
    description,
    robots: model.seo?.noindex === true ? 'noindex,nofollow' : 'index,follow,noimageindex',
    base: ctx.base,
    bodyClass: 'model-page',
    bodyStyle: fontStyleVarsFor(model.fonts),
    fontsHref: googleFontsHrefFor(model.fonts, model.richText),
    extraHead,
    body,
  });
}

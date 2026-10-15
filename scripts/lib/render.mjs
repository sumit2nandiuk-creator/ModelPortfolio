// HTML rendering for a single model's portfolio page and the neutral pages.
// Each call only ever receives ONE model's data, so a page can never contain
// another model's name, photos or links.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function dimensionAttrs(size) {
  return size ? ` width="${size.width}" height="${size.height}"` : '';
}

function uniqueInOrder(values) {
  return [...new Set(values)];
}

// Which optional sections a profile actually has. Navigation and buttons only
// link to sections that are rendered, so no link can point at nothing.
function hasContact(model) {
  const c = model.contact ?? {};
  return Boolean(
    c.email || c.phone || c.location || c.representation ||
      c.instagram || c.linkedin || c.tiktok || c.imdb || c.website,
  );
}

function sectionsFor(model) {
  return {
    about: (model.bio ?? []).length > 0 || (model.stats ?? []).length > 0,
    portfolio: (model.photos ?? []).length > 0,
    videos: (model.videos ?? []).length > 0,
    contact: hasContact(model),
  };
}

// Shared <head> pieces for every generated page.
function documentShell({ title, description = '', body, bodyClass = '', extraHead = '', robots = 'index,follow', base = '/' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  ${description ? `<meta name="description" content="${esc(description)}">` : ''}
  <meta name="robots" content="${esc(robots)}">
  <link rel="icon" href="data:,">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap">
  <link rel="stylesheet" href="${esc(base)}assets/site.css">
  ${extraHead}
</head>
<body class="${esc(bodyClass)}">
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

function renderHeader(model, available) {
  const { given, family } = splitName(model.name);
  const links = [
    ['about', 'About'],
    ['portfolio', 'Portfolio'],
    ['videos', 'Videos'],
    ['contact', 'Contact'],
  ]
    .filter(([key]) => available[key])
    .map(([key, label]) => `<a href="#${key}">${label}</a>`)
    .join('\n      ');

  return `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header" id="top">
    <a class="brand" href="#top" aria-label="${esc(model.name)} – back to top">
      <span class="brand-given">${esc(given)}</span>${family ? `
      <span class="brand-family">${esc(family)}</span>` : ''}
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

function renderHero(model, ctx, available) {
  const cover = model.cover;
  const heroButtons = [
    available.portfolio ? `<a class="btn btn-light" href="#portfolio">View portfolio</a>` : '',
    available.contact ? `<a class="btn btn-outline" href="#contact">Get in touch</a>` : '',
  ].join('\n          ');
  return `
    <section class="hero" aria-labelledby="hero-title">
      <img class="hero-media" src="${esc(ctx.mediaUrl(cover.file))}" alt="${esc(cover.alt)}"${dimensionAttrs(ctx.sizeOf(cover.file))} fetchpriority="high" decoding="async">
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="hero-content">
        <p class="eyebrow hero-eyebrow">${esc(model.tagline)}</p>
        <h1 id="hero-title" class="hero-name">${esc(model.name)}</h1>
        ${heroButtons.trim() ? `<div class="hero-actions">
          ${heroButtons}
        </div>` : ''}
      </div>
      ${available.about ? `<a class="scroll-cue" href="#about" aria-label="Scroll to about"><span></span></a>` : ''}
    </section>`;
}

function renderAbout(model) {
  const bio = model.bio ?? [];
  const stats = model.stats ?? [];
  if (!bio.length && !stats.length) return '';
  return `
    <section id="about" class="section about" aria-labelledby="about-title">
      <div class="container about-grid">
        <div class="about-text reveal">
          <p class="eyebrow">About</p>
          <h2 id="about-title" class="section-title">${esc(model.name)}</h2>
          ${bio.map((p) => `<p class="lead">${esc(p)}</p>`).join('\n          ')}
        </div>
        ${
          stats.length
            ? `<aside class="about-stats reveal" aria-label="Measurements and details">
          <dl class="stats">
            ${stats.map((s) => `<div class="stat"><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('\n            ')}
          </dl>
        </aside>`
            : ''
        }
      </div>
    </section>`;
}

function renderPortfolio(model, ctx) {
  const photos = model.photos ?? [];
  if (!photos.length) return '';

  const categories = uniqueInOrder(photos.map((p) => p.category));
  const filters =
    categories.length > 1
      ? `
        <div class="filters" role="group" aria-label="Filter photos by category">
          <button class="filter is-active" type="button" data-filter="all" aria-pressed="true">All</button>
          ${categories
            .map((c) => `<button class="filter" type="button" data-filter="${esc(c)}" aria-pressed="false">${esc(c)}</button>`)
            .join('\n          ')}
        </div>`
      : '';

  const items = photos
    .map((photo, i) => {
      const src = ctx.mediaUrl(photo.file);
      const alt = photo.alt || photo.title;
      const caption = [photo.category, photo.title].filter(Boolean).join(' · ');
      return `
        <figure class="gallery-item reveal" data-category="${esc(photo.category)}">
          <button class="gallery-btn" type="button" data-index="${i}" data-src="${esc(src)}" data-alt="${esc(alt)}" data-caption="${esc(caption)}" aria-label="Open photo: ${esc(caption)}">
            <img src="${esc(src)}" alt="${esc(alt)}"${dimensionAttrs(ctx.sizeOf(photo.file))} loading="lazy" decoding="async">
          </button>
          <figcaption class="gallery-caption">
            <span class="tag">${esc(photo.category)}</span>
            <span class="gallery-title">${esc(photo.title)}</span>
            ${photo.year ? `<span class="gallery-year">${esc(photo.year)}</span>` : ''}
          </figcaption>
        </figure>`;
    })
    .join('\n');

  return `
    <section id="portfolio" class="section section-alt" aria-labelledby="portfolio-title">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow">Selected work</p>
          <h2 id="portfolio-title" class="section-title">Portfolio</h2>
        </header>
        ${filters}
        <div class="gallery">${items}
        </div>
      </div>
    </section>`;
}

function renderVideos(model, ctx) {
  const videos = model.videos ?? [];
  if (!videos.length) return '';

  const cards = videos
    .map((video) => {
      const poster = video.poster ? ` poster="${esc(ctx.mediaUrl(video.poster))}"` : '';
      return `
          <figure class="video-card reveal">
            <div class="video-frame">
              <video controls playsinline preload="metadata"${poster} src="${esc(ctx.mediaUrl(video.file))}" aria-label="${esc(video.title)}"></video>
            </div>
            <figcaption>
              ${video.category ? `<span class="tag">${esc(video.category)}</span>` : ''}
              <h3 class="video-title">${esc(video.title)}</h3>
              ${video.description ? `<p class="video-desc">${esc(video.description)}</p>` : ''}
            </figcaption>
          </figure>`;
    })
    .join('\n');

  return `
    <section id="videos" class="section" aria-labelledby="videos-title">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow">Motion</p>
          <h2 id="videos-title" class="section-title">Videos</h2>
        </header>
        <div class="video-grid">${cards}
        </div>
      </div>
    </section>`;
}

function renderContact(model) {
  const c = model.contact ?? {};
  const socials = [
    ['Instagram', c.instagram],
    ['LinkedIn', c.linkedin],
    ['TikTok', c.tiktok],
    ['IMDb', c.imdb],
    ['Website', c.website],
  ].filter(([, url]) => url);

  if (!hasContact(model)) return '';

  const phoneDigits = c.phone ? c.phone.replace(/[^+\d]/g, '') : '';

  return `
    <section id="contact" class="section contact" aria-labelledby="contact-title">
      <div class="container contact-grid">
        <div class="reveal">
          <p class="eyebrow">Bookings &amp; enquiries</p>
          <h2 id="contact-title" class="contact-heading">Let’s create something <em>beautiful</em> together.</h2>
          ${
            c.email
              ? `<a class="contact-email" href="mailto:${esc(c.email)}">${esc(c.email)}</a>`
              : ''
          }
        </div>
        <ul class="contact-list reveal">
          ${c.location ? `<li><span class="label">Based in</span><span>${esc(c.location)}</span></li>` : ''}
          ${c.representation ? `<li><span class="label">Representation</span><span>${esc(c.representation)}</span></li>` : ''}
          ${c.phone ? `<li><span class="label">Phone</span><a href="tel:${esc(phoneDigits)}">${esc(c.phone)}</a></li>` : ''}
          ${socials
            .map(
              ([label, url]) =>
                `<li><span class="label">${esc(label)}</span><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></li>`,
            )
            .join('\n          ')}
        </ul>
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

function renderLightbox() {
  return `
  <dialog id="lightbox" class="lightbox" aria-label="Photo viewer">
    <div class="lb-inner">
      <button class="lb-btn lb-close" type="button" aria-label="Close photo viewer">✕</button>
      <button class="lb-btn lb-prev" type="button" aria-label="Previous photo">‹</button>
      <figure class="lb-figure">
        <img id="lb-img" alt="">
        <figcaption id="lb-caption"></figcaption>
      </figure>
      <button class="lb-btn lb-next" type="button" aria-label="Next photo">›</button>
    </div>
  </dialog>`;
}

// The single model page. `ctx` provides:
//   base           -> site base path, e.g. "/" or "/ModelPortfolio/"
//   mediaUrl(file) -> public URL of a media file for THIS model
//   sizeOf(file)   -> { width, height } or null
//   year           -> footer year
export function renderModelPage(model, ctx) {
  const title = `${model.name} · ${model.tagline}`;
  const description = model.seo?.description || model.tagline;
  const cover = ctx.mediaUrl(model.cover.file);

  const available = sectionsFor(model);
  const body = `${renderHeader(model, available)}
  <main id="main">
    ${renderHero(model, ctx, available)}
    ${renderAbout(model)}
    ${renderPortfolio(model, ctx)}
    ${renderVideos(model, ctx)}
    ${renderContact(model)}
  </main>
  ${renderFooter(model, ctx.year)}
  ${renderLightbox()}
  <script src="${esc(ctx.base)}assets/site.js" defer></script>`;

  return documentShell({
    title,
    description,
    robots: model.seo?.noindex === true ? 'noindex,nofollow' : 'index,follow',
    base: ctx.base,
    bodyClass: 'model-page',
    extraHead: `<meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="profile">
  <meta property="og:image" content="${esc(cover)}">`,
    body,
  });
}

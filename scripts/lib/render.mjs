// HTML rendering for a single model's portfolio page and the neutral pages.
// Pure runtime-agnostic JavaScript (zero Node.js imports) so it runs identically
// during static builds and inside Cloudflare Pages Functions / Workers.
// Each call only ever receives ONE model's data, so a page can never contain
// another model's name, photos or links.

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
  <link rel="preload" href="${esc(base)}assets/fonts/cormorant-garamond-latin-400-italic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
  <script>if('scrollRestoration' in history)history.scrollRestoration='manual';if(location.hash)history.replaceState(null,'',location.pathname+location.search);</script>
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
  <header class="site-header">
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

function renderHero(model, ctx) {
  const covers = coverList(model);
  const many = covers.length > 1;

  // One slide per cover photo. A tap opens the viewer; a drag moves the slides instead.
  const slides = covers
    .map((cover, i) => {
      const src = ctx.mediaUrl(cover.file);
      const label = many ? `Open cover photo ${i + 1} of ${covers.length}` : 'Open cover photo';
      return `
        <button class="carousel-slide" type="button" data-src="${esc(src)}" data-alt="${esc(cover.alt)}" data-caption="" aria-label="${esc(label)}">
          <img class="hero-media" src="${esc(src)}" alt="${esc(cover.alt)}"${dimensionAttrs(ctx.sizeOf(cover.file))} ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false">
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

function renderAbout(model) {
  const bio = model.bio ?? [];
  const stats = model.stats ?? [];
  if (!bio.length && !stats.length) return '';
  return `
    <section id="about" class="section about" aria-labelledby="about-title">
      <div class="container about-grid">
        <div class="about-text reveal">
          <p id="about-title" class="eyebrow">About</p>
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
      // Visible caption and viewer caption show only the category; the title stays in the accessible label.
      const caption = photo.category ?? '';
      const label = [photo.category, photo.title].filter(Boolean).join(' · ');
      return `
        <figure class="gallery-item reveal" data-category="${esc(photo.category)}">
          <button class="gallery-btn" type="button" data-index="${i}" data-src="${esc(src)}" data-alt="${esc(alt)}" data-caption="${esc(caption)}" aria-label="Open photo: ${esc(label)}">
            <img src="${esc(src)}" alt="${esc(alt)}"${dimensionAttrs(ctx.sizeOf(photo.file))} loading="lazy" decoding="async" draggable="false">
          </button>
          <figcaption class="gallery-caption">
            <span class="tag">${esc(photo.category)}</span>
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
              <video controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsinline preload="metadata"${poster} src="${esc(ctx.mediaUrl(video.file))}" aria-label="${esc(video.title)}"></video>
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

  return `
    <section id="contact" class="section contact" aria-labelledby="contact-title">
      <div class="container">
        <div class="contact-head reveal">
          <p class="eyebrow">Bookings &amp; enquiries</p>
          <h2 id="contact-title" class="contact-heading">Let’s create something <em>beautiful</em> together.</h2>
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
  const cover = ctx.mediaUrl(coverList(model)[0].file);

  const available = sectionsFor(model);
  const body = `<div id="top" class="top-anchor" aria-hidden="true"></div>
  ${renderHeader(model, available)}
  <main id="main">
    ${renderHero(model, ctx)}
    ${renderAbout(model)}
    ${renderPortfolio(model, ctx)}
    ${renderVideos(model, ctx)}
    ${renderContact(model)}
  </main>
  ${renderFooter(model, ctx.year)}
  ${renderLightbox()}
  ${renderWhatsAppFloat(model)}
  <script src="${esc(ctx.base)}assets/site.js" defer></script>`;

  return documentShell({
    title,
    description,
    robots: model.seo?.noindex === true ? 'noindex,nofollow' : 'index,follow,noimageindex',
    base: ctx.base,
    bodyClass: 'model-page',
    extraHead: `<meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="profile">
  <meta property="og:image" content="${esc(cover)}">`,
    body,
  });
}

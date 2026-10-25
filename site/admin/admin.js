// Portfolio admin: sign in, pick a profile, edit its details, add or remove photos and videos.
// Plain browser JavaScript, no build step. It talks only to the admin Worker (config.js).
// Hosted media (https:// links, for example Cloudflare R2) are uploaded through the Worker;
// existing media in the repo are shown but not uploaded again.

(function () {
  'use strict';

  var CONFIG = window.ADMIN_CONFIG || {};
  var API_BASE = String(CONFIG.apiBase || '').replace(/\/+$/, '');
  var SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var RESERVED = ['assets', 'media', 'models', 'api', 'admin', 'static', 'login', 'dashboard', 'index', '404'];
  var MAX_IMAGE = 25 * 1024 * 1024;
  var MAX_VIDEO = 95 * 1024 * 1024;

  // Kept in step with scripts/lib/fonts.mjs so every selection validates cleanly on save.
  var FONT_CATALOG = [
    { id: 'cormorant-garamond', label: 'Cormorant Garamond', category: 'Editorial & Luxury Serif', stack: "'Cormorant Garamond', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif", google: 'Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700' },
    { id: 'playfair-display', label: 'Playfair Display', category: 'Editorial & Luxury Serif', stack: "'Playfair Display', Georgia, serif", google: 'Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700' },
    { id: 'bodoni-moda', label: 'Bodoni Moda', category: 'Editorial & Luxury Serif', stack: "'Bodoni Moda', 'Didot', Georgia, serif", google: 'Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;0,6..96,600;0,6..96,700;1,6..96,400;1,6..96,500;1,6..96,600;1,6..96,700' },
    { id: 'eb-garamond', label: 'EB Garamond', category: 'Editorial & Luxury Serif', stack: "'EB Garamond', Garamond, Georgia, serif", google: 'EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700' },
    { id: 'lora', label: 'Lora', category: 'Editorial & Luxury Serif', stack: "'Lora', Georgia, serif", google: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700' },
    { id: 'libre-baskerville', label: 'Libre Baskerville', category: 'Editorial & Luxury Serif', stack: "'Libre Baskerville', Baskerville, Georgia, serif", google: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400' },
    { id: 'instrument-serif', label: 'Instrument Serif', category: 'Editorial & Luxury Serif', stack: "'Instrument Serif', Georgia, serif", google: 'Instrument+Serif:ital@0;1' },
    { id: 'cinzel', label: 'Cinzel', category: 'Editorial & Luxury Serif', stack: "'Cinzel', 'Trajan Pro', Georgia, serif", google: 'Cinzel:wght@400;500;600;700' },
    { id: 'inter', label: 'Inter', category: 'Modern & Studio Sans', stack: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", google: 'Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,300;1,14..32,400;1,14..32,500;1,14..32,600;1,14..32,700' },
    { id: 'jost', label: 'Jost', category: 'Modern & Studio Sans', stack: "'Jost', 'Futura', system-ui, sans-serif", google: 'Jost:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700' },
    { id: 'montserrat', label: 'Montserrat', category: 'Modern & Studio Sans', stack: "'Montserrat', 'Helvetica Neue', Arial, sans-serif", google: 'Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700' },
    { id: 'plus-jakarta-sans', label: 'Plus Jakarta Sans', category: 'Modern & Studio Sans', stack: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif", google: 'Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700' },
    { id: 'dm-sans', label: 'DM Sans', category: 'Modern & Studio Sans', stack: "'DM Sans', system-ui, -apple-system, sans-serif", google: 'DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300;1,9..40,400;1,9..40,500;1,9..40,600;1,9..40,700' },
    { id: 'syne', label: 'Syne', category: 'Modern & Studio Sans', stack: "'Syne', system-ui, sans-serif", google: 'Syne:wght@400;500;600;700' },
    { id: 'pinyon-script', label: 'Pinyon Script', category: 'Couture & Signature Script', stack: "'Pinyon Script', cursive", google: 'Pinyon+Script' },
    { id: 'great-vibes', label: 'Great Vibes', category: 'Couture & Signature Script', stack: "'Great Vibes', cursive", google: 'Great+Vibes' },
  ];

  var FONT_SLOTS = [
    { key: 'name', label: 'Name (header)', hint: 'Top-left brand name lockup', defaultFamily: 'cormorant-garamond', defaultStyle: 'italic', defaultWeight: '500' },
    { key: 'headings', label: 'Headings', hint: 'Section titles (Portfolio, Videos, Contact) and video titles', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500' },
    { key: 'bio', label: 'About (biography)', hint: 'Paragraphs in the About section', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400' },
    { key: 'stats', label: 'Measurements', hint: 'Labels and values in the Measurements box', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '400' },
    { key: 'captions', label: 'Contact & captions', hint: 'Email & phone cards, category tags, captions and navigation', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400' },
  ];

  var WEIGHT_LABELS = { '300': 'Light (300)', '400': 'Regular (400)', '500': 'Medium (500)', '600': 'Semi-bold (600)', '700': 'Bold (700)' };

  function fontById(id) {
    for (var i = 0; i < FONT_CATALOG.length; i++) {
      if (FONT_CATALOG[i].id === id) return FONT_CATALOG[i];
    }
    return null;
  }

  function ensurePreviewFonts() {
    if (typeof document === 'undefined' || $('admin-preview-fonts')) return;
    var link = document.createElement('link');
    link.id = 'admin-preview-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?' +
      FONT_CATALOG.map(function (f) { return 'family=' + f.google; }).join('&') + '&display=swap';
    document.head.appendChild(link);
  }

  var S = {
    token: sessionStorage.getItem('admin.token') || '',
    models: [],
    slug: '',
    isNew: false,
    model: null,     // the profile being edited
    sha: null,       // version of model.json we loaded (null for a new profile)
    saved: '',       // JSON of the last saved/loaded profile, to detect unsaved changes
    pendingDeletes: [], // hosted files removed in this session, deleted after a successful save
    busy: false,
  };

  var $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isHttp(value) { return /^https?:\/\//i.test(String(value || '')); }

  // Where a file is shown from: hosted files as they are; repo files from the published site.
  function mediaSrc(file) {
    if (isHttp(file)) return file;
    return '../' + encodeURIComponent(S.slug) + '/media/' + encodeURIComponent(file);
  }

  // ---- Network -----------------------------------------------------------

  function api(method, path, options) {
    options = options || {};
    var headers = { Authorization: 'Bearer ' + S.token };
    var body;
    if (options.form) {
      body = options.form;
    } else if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    }
    return fetch(API_BASE + path, { method: method, headers: headers, body: body }).then(function (res) {
      if (res.status === 204) return null;
      var contentType = (res.headers && res.headers.get('content-type')) || '';
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var fallback = res.status === 404 && contentType.indexOf('application/json') === -1
            ? 'Admin API not found at /api. Deploy on Cloudflare Pages or set apiBase in admin/config.js.'
            : 'The request failed (' + res.status + ').';
          var err = new Error(data.error || fallback);
          err.status = res.status;
          err.details = data.errors || [];
          throw err;
        }
        return data;
      });
    }, function () {
      throw new Error('Could not reach the admin service. Check your connection and the apiBase in config.js.');
    });
  }

  function profilePath(slug, rest) {
    return '/api/models/' + encodeURIComponent(slug) + (rest || '');
  }

  // ---- Data helpers ------------------------------------------------------

  function blankProfile(slug, name) {
    return { slug: slug, name: name, bio: [], stats: [], fonts: {}, cover: [], photos: [], videos: [], contact: {} };
  }

  // Makes sure every list exists, so the forms never meet missing data.
  function normalise(model) {
    var m = JSON.parse(JSON.stringify(model));
    m.cover = Array.isArray(m.cover) ? m.cover : (m.cover ? [m.cover] : []);
    m.photos = Array.isArray(m.photos) ? m.photos : [];
    m.videos = Array.isArray(m.videos) ? m.videos : [];
    m.bio = Array.isArray(m.bio) ? m.bio : [];
    m.stats = Array.isArray(m.stats) ? m.stats : [];
    m.contact = m.contact || {};
    m.fonts = (m.fonts && typeof m.fonts === 'object' && !Array.isArray(m.fonts)) ? m.fonts : {};
    return m;
  }

  function trimmed(value) { return typeof value === 'string' ? value.trim() : value; }

  // The profile as it is saved. Starts from a copy of everything already in the file, so keys this
  // page does not edit are kept. Empty optional fields are removed and text is trimmed.
  function cleanProfile(m) {
    var out = {};
    Object.keys(m).forEach(function (k) { out[k] = m[k]; });
    out.name = trimmed(m.name);
    setOrDelete(out, 'tagline', trimmed(m.tagline));

    var bio = m.bio.map(trimmed).filter(Boolean);
    setOrDelete(out, 'bio', bio.length ? bio : null);

    var stats = m.stats
      .filter(function (s) { return trimmed(s.label) && trimmed(s.value); })
      .map(function (s) { return cleanEntry(s, ['label', 'value']); });
    setOrDelete(out, 'stats', stats.length ? stats : null);

    if (m.seo) {
      var seo = cleanEntry(m.seo, ['description']);
      if (m.seo.noindex === true) seo.noindex = true; else delete seo.noindex;
      setOrDelete(out, 'seo', Object.keys(seo).length ? seo : null);
    }

    out.cover = m.cover.map(function (c) { return cleanEntry(c, ['file', 'alt', 'width', 'height']); });
    out.photos = m.photos.map(function (p) {
      return cleanEntry(p, ['file', 'title', 'category', 'year', 'alt', 'width', 'height']);
    });
    out.videos = m.videos.map(function (v) {
      return cleanEntry(v, ['file', 'poster', 'posterWidth', 'posterHeight', 'title', 'category', 'description']);
    });

    var contact = cleanEntry(m.contact || {}, Object.keys(m.contact || {}));
    setOrDelete(out, 'contact', Object.keys(contact).length ? contact : null);

    var fonts = {};
    if (m.fonts && typeof m.fonts === 'object') {
      FONT_SLOTS.forEach(function (slot) {
        var raw = m.fonts[slot.key];
        if (!raw || typeof raw !== 'object') return;
        var cleaned = cleanEntry(raw, ['family', 'style', 'weight']);
        if (cleaned.weight !== undefined) cleaned.weight = String(cleaned.weight);
        if (Object.keys(cleaned).length) fonts[slot.key] = cleaned;
      });
    }
    setOrDelete(out, 'fonts', Object.keys(fonts).length ? fonts : null);
    return out;
  }

  // Copies every key of an entry (so unknown keys survive), trims the listed text keys and drops empties.
  function cleanEntry(entry, keys) {
    var out = {};
    Object.keys(entry).forEach(function (k) { out[k] = entry[k]; });
    keys.forEach(function (key) {
      var value = trimmed(out[key]);
      if (value === undefined || value === null || value === '') delete out[key];
      else out[key] = value;
    });
    return out;
  }

  function setOrDelete(obj, key, value) {
    if (value === undefined || value === null || value === '') delete obj[key];
    else obj[key] = value;
  }

  function snapshot() { return JSON.stringify(cleanProfile(S.model)); }

  function isDirty() { return S.model && snapshot() !== S.saved; }

  // ---- Status and messages ----------------------------------------------

  function setStatus(text, kind) {
    var el = $('status');
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  var toastTimer = null;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function setBusy(on, label) {
    S.busy = on;
    $('save').disabled = on;
    if (on) setStatus(label || 'Working…');
  }

  function updateDirtyNote() {
    $('dirty-note').textContent = isDirty() ? 'Unsaved changes' : (S.model ? 'All changes saved' : '');
  }

  // ---- Screens -----------------------------------------------------------

  function showScreen(name) {
    $('login').hidden = name !== 'login';
    $('setup').hidden = name !== 'setup';
    $('editor').hidden = name !== 'editor';
    $('top-actions').hidden = name !== 'editor';
  }

  function configured() {
    return API_BASE.indexOf('example.workers.dev') === -1;
  }

  function signIn(token) {
    S.token = token;
    sessionStorage.setItem('admin.token', token);
    return api('GET', '/api/models').then(function (data) {
      S.models = data.models || [];
      showScreen('editor');
      renderPicker();
      if (S.models.length) return openProfile(S.models[0]);
      setStatus('No profiles yet. Choose “New profile” to start one.');
      S.model = null;
      $('editor-body').innerHTML = '';
      updateDirtyNote();
    });
  }

  function signOut() {
    S.token = '';
    sessionStorage.removeItem('admin.token');
    S.model = null;
    S.slug = '';
    showScreen('login');
  }

  function renderPicker() {
    var list = S.models.slice();
    if (S.isNew && S.slug && list.indexOf(S.slug) === -1) list.push(S.slug);
    $('model-picker').innerHTML = list.map(function (slug) {
      return '<option value="' + esc(slug) + '"' + (slug === S.slug ? ' selected' : '') + '>' + esc(slug) + '</option>';
    }).join('');
    $('view-site').href = S.slug ? '../' + encodeURIComponent(S.slug) + '/' : '#';
  }

  function confirmLeave() {
    return !isDirty() || window.confirm('You have unsaved changes. Discard them?');
  }

  function openProfile(slug) {
    if (!confirmLeave()) {
      $('model-picker').value = S.slug;
      return Promise.resolve();
    }
    setBusy(true, 'Loading ' + slug + '…');
    return api('GET', profilePath(slug)).then(function (data) {
      S.slug = slug;
      S.isNew = false;
      S.sha = data.sha;
      S.model = normalise(data.model);
      S.saved = snapshot();
      S.pendingDeletes = [];
      renderPicker();
      setStatus('');
      render();
    }).catch(function (err) {
      setStatus(err.message, 'error');
    }).then(function () { setBusy(false); });
  }

  function startNewProfile() {
    if (!confirmLeave()) return;
    var slug = (window.prompt('Address for the new profile (lowercase letters, numbers and hyphens), for example "jane-doe":') || '').trim();
    if (!slug) return;
    if (!SLUG_PATTERN.test(slug) || RESERVED.indexOf(slug) !== -1) {
      toast('That address is not allowed. Use lowercase letters, numbers and single hyphens.');
      return;
    }
    if (S.models.indexOf(slug) !== -1) {
      toast('A profile with that address already exists. Choose it from the list.');
      return;
    }
    var name = (window.prompt('Name of the model, for example "Jane Doe":') || '').trim();
    if (!name) return;
    S.slug = slug;
    S.isNew = true;
    S.sha = null;
    S.model = blankProfile(slug, name);
    S.saved = '';
    S.pendingDeletes = [];
    renderPicker();
    setStatus('New profile. Add at least one cover photo, then save.');
    render();
  }

  // ---- Form rendering ---------------------------------------------------

  function field(label, path, value, extra) {
    return '<label>' + esc(label) +
      '<input data-field="' + esc(path) + '" value="' + esc(value) + '"' + (extra || '') + '></label>';
  }

  function listCard(title, addControl, body) {
    return '<section class="card"><div class="toolbar"><h2>' + esc(title) + '</h2>' + addControl + '</div>' + body + '</section>';
  }

  function moveButtons(list, i, count) {
    return '<button type="button" class="btn small" data-action="move" data-list="' + list + '" data-i="' + i + '" data-dir="-1"' +
      (i === 0 ? ' disabled' : '') + '>Move up</button>' +
      '<button type="button" class="btn small" data-action="move" data-list="' + list + '" data-i="' + i + '" data-dir="1"' +
      (i === count - 1 ? ' disabled' : '') + '>Move down</button>';
  }

  function removeButton(list, i) {
    return '<button type="button" class="btn small danger" data-action="remove" data-list="' + list + '" data-i="' + i + '">Remove</button>';
  }

  function uploadButton(label, kind, extra) {
    return '<label class="btn small file-btn">' + esc(label) +
      '<input type="file" data-upload="' + kind + '"' + (extra || '') + '></label>';
  }

  function coverHtml() {
    return S.model.cover.map(function (c, i) {
      return '<div class="item">' +
        '<img class="thumb" alt="" src="' + esc(mediaSrc(c.file)) + '" loading="lazy">' +
        '<div><div class="item-fields">' +
        '<label class="full">Alt text (describe the photo for screen readers)' +
        '<input data-list="cover" data-i="' + i + '" data-key="alt" value="' + esc(c.alt) + '"></label>' +
        '</div><div class="item-actions">' + moveButtons('cover', i, S.model.cover.length) + removeButton('cover', i) +
        '</div></div></div>';
    }).join('') || '<p class="muted">No cover photos yet. The first one is shown first on the site.</p>';
  }

  function photosHtml() {
    return S.model.photos.map(function (p, i) {
      return '<div class="item">' +
        '<img class="thumb" alt="" src="' + esc(mediaSrc(p.file)) + '" loading="lazy">' +
        '<div><div class="item-fields">' +
        '<label>Title<input data-list="photos" data-i="' + i + '" data-key="title" value="' + esc(p.title) + '"></label>' +
        '<label>Category (shown as a filter)<input data-list="photos" data-i="' + i + '" data-key="category" value="' + esc(p.category) + '"></label>' +
        '<label>Year<input data-list="photos" data-i="' + i + '" data-key="year" value="' + esc(p.year) + '"></label>' +
        '<label>Alt text<input data-list="photos" data-i="' + i + '" data-key="alt" value="' + esc(p.alt) + '"></label>' +
        '</div><div class="item-actions">' + moveButtons('photos', i, S.model.photos.length) + removeButton('photos', i) +
        '</div></div></div>';
    }).join('') || '<p class="muted">No portfolio photos yet.</p>';
  }

  function videosHtml() {
    return S.model.videos.map(function (v, i) {
      var poster = v.poster
        ? '<img class="thumb wide" alt="" src="' + esc(mediaSrc(v.poster)) + '" loading="lazy">'
        : '<div class="thumb wide" aria-hidden="true"></div>';
      return '<div class="item video">' + poster +
        '<div><div class="item-fields">' +
        '<label>Title<input data-list="videos" data-i="' + i + '" data-key="title" value="' + esc(v.title) + '"></label>' +
        '<label>Category<input data-list="videos" data-i="' + i + '" data-key="category" value="' + esc(v.category) + '"></label>' +
        '<label class="full">Description<input data-list="videos" data-i="' + i + '" data-key="description" value="' + esc(v.description) + '"></label>' +
        '</div><p class="muted">Video: ' + esc(v.file ? (isHttp(v.file) ? 'hosted' : v.file) : '') + '</p>' +
        '<div class="item-actions">' + uploadButton(v.poster ? 'Replace poster image' : 'Add poster image', 'poster', ' data-i="' + i + '"') +
        moveButtons('videos', i, S.model.videos.length) + removeButton('videos', i) + '</div></div></div>';
    }).join('') || '<p class="muted">No videos yet.</p>';
  }

  function statsHtml() {
    return S.model.stats.map(function (s, i) {
      return '<div class="stat-row">' +
        '<label>Label<input data-list="stats" data-i="' + i + '" data-key="label" value="' + esc(s.label) + '"></label>' +
        '<label>Value<input data-list="stats" data-i="' + i + '" data-key="value" value="' + esc(s.value) + '"></label>' +
        removeButton('stats', i) + '</div>';
    }).join('') || '<p class="muted">No measurements yet.</p>';
  }

  function hasCustomFonts(m) {
    if (!m || !m.fonts) return false;
    return FONT_SLOTS.some(function (slot) {
      var spec = m.fonts[slot.key];
      return spec && (spec.family || spec.style || spec.weight);
    });
  }

  function resolvedFontFor(slot, m) {
    var spec = (m && m.fonts && m.fonts[slot.key]) || {};
    var entry = fontById(spec.family || slot.defaultFamily) || FONT_CATALOG[0];
    return {
      stack: entry.stack,
      style: spec.style || slot.defaultStyle,
      weight: String(spec.weight || slot.defaultWeight),
    };
  }

  function previewSampleFor(slotKey, m) {
    if (slotKey === 'name') return trimmed(m.name) || 'Model Name';
    if (slotKey === 'headings') return 'Portfolio · Let’s create something beautiful together.';
    if (slotKey === 'bio') {
      var first = (m.bio && m.bio.length && trimmed(m.bio[0])) || '';
      if (first.length > 130) return first.slice(0, 127) + '…';
      return first || 'Expressive presence across editorial, bridal and commercial campaigns.';
    }
    if (slotKey === 'stats') {
      var s = m.stats && m.stats[0];
      var lbl = (s && trimmed(s.label)) ? trimmed(s.label).toUpperCase() : 'HEIGHT';
      var val = (s && trimmed(s.value)) || '5′4″';
      return lbl + ' — ' + val;
    }
    var c = m.contact || {};
    return 'BRIDAL · ' + (trimmed(c.email) || trimmed(c.phone) || 'bookings@example.com');
  }

  function familyOptionsHtml(selectedId, defaultId) {
    var defaultFont = fontById(defaultId);
    var html = '<option value="">Default (' + esc(defaultFont ? defaultFont.label : defaultId) + ')</option>';
    var categories = [];
    FONT_CATALOG.forEach(function (f) {
      if (categories.indexOf(f.category) === -1) categories.push(f.category);
    });
    categories.forEach(function (cat) {
      html += '<optgroup label="' + esc(cat) + '">';
      FONT_CATALOG.filter(function (f) { return f.category === cat; }).forEach(function (f) {
        html += '<option value="' + esc(f.id) + '"' + (f.id === selectedId ? ' selected' : '') + '>' + esc(f.label) + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function styleOptionsHtml(selectedStyle, defaultStyle) {
    var defLabel = defaultStyle === 'italic' ? 'Italic' : 'Regular';
    return '<option value="">Default (' + defLabel + ')</option>' +
      '<option value="normal"' + (selectedStyle === 'normal' ? ' selected' : '') + '>Regular</option>' +
      '<option value="italic"' + (selectedStyle === 'italic' ? ' selected' : '') + '>Italic</option>';
  }

  function weightOptionsHtml(selectedWeight, defaultWeight) {
    var sel = selectedWeight ? String(selectedWeight) : '';
    var html = '<option value="">Default (' + esc(WEIGHT_LABELS[defaultWeight] || defaultWeight) + ')</option>';
    ['300', '400', '500', '600', '700'].forEach(function (w) {
      html += '<option value="' + w + '"' + (sel === w ? ' selected' : '') + '>' + esc(WEIGHT_LABELS[w]) + '</option>';
    });
    return html;
  }

  function fontsHtml() {
    var m = S.model;
    var fonts = m.fonts || {};
    return '<div class="font-list">' + FONT_SLOTS.map(function (slot) {
      var spec = fonts[slot.key] || {};
      var resolved = resolvedFontFor(slot, m);
      var previewStyle = 'font-family:' + resolved.stack + ';font-style:' + resolved.style + ';font-weight:' + resolved.weight;
      return '<div class="font-row">' +
        '<div class="font-row-head">' +
          '<span class="font-row-title">' + esc(slot.label) + '</span>' +
          '<span class="font-row-hint">' + esc(slot.hint) + '</span>' +
        '</div>' +
        '<div class="font-controls">' +
          '<label>Font family<select data-font-slot="' + slot.key + '" data-font-prop="family">' +
            familyOptionsHtml(spec.family || '', slot.defaultFamily) +
          '</select></label>' +
          '<label>Style<select data-font-slot="' + slot.key + '" data-font-prop="style">' +
            styleOptionsHtml(spec.style || '', slot.defaultStyle) +
          '</select></label>' +
          '<label>Weight<select data-font-slot="' + slot.key + '" data-font-prop="weight">' +
            weightOptionsHtml(spec.weight || '', slot.defaultWeight) +
          '</select></label>' +
        '</div>' +
        '<div class="font-preview font-preview--' + slot.key + '" data-font-preview="' + slot.key + '" style="' + esc(previewStyle) + '">' +
          esc(previewSampleFor(slot.key, m)) +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function refreshFontPreviews() {
    if (!S.model) return;
    var root = $('editor-body');
    FONT_SLOTS.forEach(function (slot) {
      var el = root.querySelector('[data-font-preview="' + slot.key + '"]');
      if (!el) return;
      var resolved = resolvedFontFor(slot, S.model);
      el.style.fontFamily = resolved.stack;
      el.style.fontStyle = resolved.style;
      el.style.fontWeight = resolved.weight;
      el.textContent = previewSampleFor(slot.key, S.model);
    });
    var resetBtn = root.querySelector('[data-action="reset-fonts"]');
    if (resetBtn) resetBtn.disabled = !hasCustomFonts(S.model);
  }

  function render() {
    ensurePreviewFonts();
    var m = S.model;
    var contact = m.contact || {};
    var bio = m.bio.join('\n\n');
    var seo = m.seo || {};
    $('editor-body').innerHTML = [
      '<section class="card"><h2>Profile</h2><div class="grid">',
      field('Name', 'name', m.name, ' required'),
      field('Tagline (optional)', 'tagline', m.tagline || ''),
      '<label class="full">About (leave a blank line between paragraphs)<textarea data-bio rows="6">' + esc(bio) + '</textarea></label>',
      field('Search description (optional)', 'seo.description', seo.description || ''),
      '<label class="full" style="display:flex;gap:8px;align-items:center">' +
        '<input type="checkbox" data-field="seo.noindex"' + (seo.noindex ? ' checked' : '') + ' style="width:auto"> Hide this page from search engines</label>',
      '</div></section>',

      listCard(
        'Typography',
        '<button type="button" class="btn small" data-action="reset-fonts"' + (hasCustomFonts(m) ? '' : ' disabled') + '>Reset to defaults</button>',
        fontsHtml()
      ),

      listCard('Measurements', '<button type="button" class="btn small" data-action="add-stat">Add row</button>', statsHtml()),

      '<section class="card"><h2>Contact</h2><div class="grid">',
      field('Email', 'contact.email', contact.email || ''),
      field('Phone', 'contact.phone', contact.phone || ''),
      field('WhatsApp number', 'contact.whatsapp', contact.whatsapp || ''),
      field('Instagram (full link)', 'contact.instagram', contact.instagram || ''),
      field('LinkedIn (full link)', 'contact.linkedin', contact.linkedin || ''),
      field('TikTok (full link)', 'contact.tiktok', contact.tiktok || ''),
      field('IMDb (full link)', 'contact.imdb', contact.imdb || ''),
      field('Website (full link)', 'contact.website', contact.website || ''),
      '</div></section>',

      listCard('Cover photos (hero slideshow)', uploadButton('Add cover photo', 'cover', ' accept="image/*"'), '<div class="list">' + coverHtml() + '</div>'),
      listCard('Portfolio photos', uploadButton('Add photo', 'photo', ' accept="image/*" multiple'), '<div class="list">' + photosHtml() + '</div>'),
      listCard('Videos', uploadButton('Add video', 'video', ' accept="video/mp4,video/webm,video/x-m4v"'), '<div class="list">' + videosHtml() + '</div>'),
    ].join('');
    updateDirtyNote();
  }

  // ---- Editing ----------------------------------------------------------

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var target = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }

  function updateFontControl(t) {
    var slotKey = t.getAttribute('data-font-slot');
    var prop = t.getAttribute('data-font-prop');
    if (!slotKey || !prop || !S.model) return false;
    if (!S.model.fonts || typeof S.model.fonts !== 'object') S.model.fonts = {};
    if (!S.model.fonts[slotKey] || typeof S.model.fonts[slotKey] !== 'object') {
      S.model.fonts[slotKey] = {};
    }
    if (t.value) S.model.fonts[slotKey][prop] = t.value;
    else delete S.model.fonts[slotKey][prop];
    if (!Object.keys(S.model.fonts[slotKey]).length) delete S.model.fonts[slotKey];
    refreshFontPreviews();
    updateDirtyNote();
    return true;
  }

  function onInput(e) {
    var t = e.target;
    if (!S.model) return;
    if (t.hasAttribute('data-font-slot')) {
      updateFontControl(t);
      return;
    }
    if (t.hasAttribute('data-bio')) {
      S.model.bio = t.value.split(/\n\s*\n/).map(trimmed).filter(Boolean);
    } else if (t.hasAttribute('data-field')) {
      var value = t.type === 'checkbox' ? t.checked : t.value;
      setPath(S.model, t.getAttribute('data-field'), value);
    } else if (t.hasAttribute('data-list')) {
      var list = S.model[t.getAttribute('data-list')];
      var item = list[Number(t.getAttribute('data-i'))];
      if (item) item[t.getAttribute('data-key')] = t.value;
    } else {
      return;
    }
    refreshFontPreviews();
    updateDirtyNote();
  }

  function removeItem(listName, i) {
    var list = S.model[listName];
    var item = list[i];
    if (!item) return;
    var files = [];
    if (item.file) files.push(item.file);
    if (item.poster) files.push(item.poster);
    files.forEach(function (f) {
      if (isHttp(f) && S.pendingDeletes.indexOf(f) === -1) S.pendingDeletes.push(f);
    });
    list.splice(i, 1);
    render();
  }

  function onClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    var action = btn.getAttribute('data-action');
    var list = btn.getAttribute('data-list');
    var i = Number(btn.getAttribute('data-i'));
    if (action === 'remove') {
      if (window.confirm('Remove this entry? Hosted files are deleted when you save.')) removeItem(list, i);
    } else if (action === 'move') {
      var dir = Number(btn.getAttribute('data-dir'));
      var items = S.model[list];
      var j = i + dir;
      if (j < 0 || j >= items.length) return;
      var tmp = items[i]; items[i] = items[j]; items[j] = tmp;
      render();
    } else if (action === 'add-stat') {
      S.model.stats.push({ label: '', value: '' });
      render();
    } else if (action === 'reset-fonts') {
      S.model.fonts = {};
      render();
    }
  }

  // ---- Uploads ----------------------------------------------------------

  function imageSize(file) {
    if (typeof createImageBitmap !== 'function') return Promise.resolve(null);
    return createImageBitmap(file).then(function (bmp) {
      var size = { width: bmp.width, height: bmp.height };
      if (bmp.close) bmp.close();
      return size;
    }, function () { return null; });
  }

  function titleFrom(file) {
    return file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  }

  function uploadFile(file) {
    var form = new FormData();
    form.append('file', file);
    return api('POST', profilePath(S.slug, '/media'), { form: form });
  }

  function onChange(e) {
    var input = e.target;
    if (input.hasAttribute('data-font-slot')) {
      updateFontControl(input);
      return;
    }
    var kind = input.getAttribute('data-upload');
    if (!kind || !input.files || !input.files.length) return;
    var files = Array.prototype.slice.call(input.files);
    input.value = '';
    var index = Number(input.getAttribute('data-i'));
    if (kind === 'poster') return uploadPoster(files[0], index);
    files.reduce(function (chain, file) {
      return chain.then(function () { return addMedia(kind, file); });
    }, Promise.resolve());
  }

  function addMedia(kind, file) {
    var isVideo = kind === 'video';
    var limit = isVideo ? MAX_VIDEO : MAX_IMAGE;
    if (file.size > limit) {
      toast(file.name + ' is too large (' + (isVideo ? '95' : '25') + ' MB maximum).');
      return Promise.resolve();
    }
    setBusy(true, 'Uploading ' + file.name + '…');
    return Promise.all([uploadFile(file), isVideo ? Promise.resolve(null) : imageSize(file)]).then(function (results) {
      var uploaded = results[0];
      var size = results[1];
      if (kind === 'cover') {
        S.model.cover.push(withSize({ file: uploaded.url, alt: titleFrom(file) }, size));
      } else if (kind === 'photo') {
        S.model.photos.push(withSize({ file: uploaded.url, title: titleFrom(file), category: 'Portfolio', year: '', alt: '' }, size));
      } else if (kind === 'video') {
        S.model.videos.push({ file: uploaded.url, title: titleFrom(file), category: '', description: '' });
      }
      setStatus('Uploaded ' + file.name + '. Save to publish it.', 'ok');
      render();
    }).catch(function (err) {
      setStatus(err.message, 'error');
    }).then(function () { setBusy(false); });
  }

  function uploadPoster(file, index) {
    var video = S.model.videos[index];
    if (!video) return Promise.resolve();
    if (file.size > MAX_IMAGE) { toast('The poster image must be 25 MB or smaller.'); return Promise.resolve(); }
    setBusy(true, 'Uploading poster…');
    return Promise.all([uploadFile(file), imageSize(file)]).then(function (results) {
      var uploaded = results[0];
      var size = results[1];
      if (video.poster && isHttp(video.poster) && S.pendingDeletes.indexOf(video.poster) === -1) {
        S.pendingDeletes.push(video.poster);
      }
      video.poster = uploaded.url;
      if (size) { video.posterWidth = size.width; video.posterHeight = size.height; }
      setStatus('Poster uploaded. Save to publish it.', 'ok');
      render();
    }).catch(function (err) {
      setStatus(err.message, 'error');
    }).then(function () { setBusy(false); });
  }

  function withSize(entry, size) {
    if (size) { entry.width = size.width; entry.height = size.height; }
    return entry;
  }

  // ---- Saving -----------------------------------------------------------

  function save() {
    if (!S.model || S.busy) return;
    var model = cleanProfile(S.model);
    setBusy(true, 'Saving…');
    var path = profilePath(S.slug);
    api('PUT', path, { json: { sha: S.sha, model: model } }).then(function (data) {
      S.sha = data.sha;
      S.saved = JSON.stringify(model);
      S.isNew = false;
      if (S.models.indexOf(S.slug) === -1) S.models.push(S.slug);
      S.models.sort();
      renderPicker();
      return removeHostedFiles();
    }).then(function () {
      setStatus('Saved. Changes are live immediately.', 'ok');
      toast('Saved');
      updateDirtyNote();
    }).catch(function (err) {
      var detail = err.details && err.details.length ? ' ' + err.details.join(' ') : '';
      setStatus((err.message || 'Saving failed.') + detail, 'error');
    }).then(function () { setBusy(false); });
  }

  // Deletes hosted files that were removed from the profile. A file that fails to delete is
  // kept in the list and retried on the next save; the profile itself is already saved.
  function removeHostedFiles() {
    var queue = S.pendingDeletes.slice();
    return queue.reduce(function (chain, url) {
      return chain.then(function () {
        return api('DELETE', profilePath(S.slug, '/media'), { json: { url: url } }).then(function () {
          S.pendingDeletes = S.pendingDeletes.filter(function (u) { return u !== url; });
        }, function () { /* keep for a later save */ });
      });
    }, Promise.resolve());
  }

  function startAfterSignIn() {
    if (!configured()) {
      showScreen('setup');
      return;
    }
    if (!S.token) {
      showScreen('login');
      return;
    }
    signIn(S.token).catch(function (err) {
      if (err.status === 401) {
        signOut();
        $('login-error').textContent = 'That token is not valid. Try again.';
      } else {
        showScreen('editor');
        setStatus(err.message, 'error');
      }
    });
  }

  // ---- Wire up ----------------------------------------------------------

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var token = $('token').value.trim();
    $('login-error').textContent = '';
    if (!token) return;
    if (!configured()) { showScreen('setup'); return; }
    signIn(token).catch(function (err) {
      if (err.status === 401) $('login-error').textContent = 'That token is not valid.';
      else $('login-error').textContent = err.message;
      if (err.status === 401) { S.token = ''; sessionStorage.removeItem('admin.token'); }
    });
  });

  $('model-picker').addEventListener('change', function (e) { openProfile(e.target.value); });
  $('new-model').addEventListener('click', startNewProfile);
  $('sign-out').addEventListener('click', function () {
    if (confirmLeave()) signOut();
  });
  $('save').addEventListener('click', save);

  var body = $('editor-body');
  body.addEventListener('input', onInput);
  body.addEventListener('change', onChange);
  body.addEventListener('click', onClick);

  window.addEventListener('beforeunload', function (e) {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  startAfterSignIn();
})();

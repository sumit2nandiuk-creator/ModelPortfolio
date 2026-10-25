// Portfolio admin: sign in, pick a profile, write texts in email-style composer boxes
// with inline & box-level font formatting, and manage photos and videos.
// Plain browser JavaScript, no build step. Saves go straight to R2 via /api/models/:slug.

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
    { key: 'name', defaultFamily: 'cormorant-garamond', defaultStyle: 'italic', defaultWeight: '500', defaultColor: '#15130f' },
    { key: 'headings', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500', defaultColor: '#15130f' },
    { key: 'aboutLabel', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '600', defaultColor: '#9a6a3c' },
    { key: 'bio', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400', defaultColor: '#2a2620' },
    { key: 'stats', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '400', defaultColor: '#15130f' },
    { key: 'portfolioLabel', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '600', defaultColor: '#9a6a3c' },
    { key: 'portfolioHeading', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500', defaultColor: '#15130f' },
    { key: 'captions', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400', defaultColor: '#6f675c' },
    { key: 'videosLabel', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '600', defaultColor: '#9a6a3c' },
    { key: 'videosHeading', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500', defaultColor: '#15130f' },
    { key: 'videoText', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500', defaultColor: '#15130f' },
    { key: 'contactLabel', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '600', defaultColor: '#c9a77d' },
    { key: 'contactHeading', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '400', defaultColor: '#f7f4ef' },
    { key: 'contact', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400', defaultColor: '#15130f' },
  ];

  var DEFAULT_TEXTS = {
    aboutLabel: 'About',
    portfolioLabel: 'Selected work',
    portfolioHeading: 'Portfolio',
    videosLabel: 'Motion',
    videosHeading: 'Videos',
    contactLabel: 'Bookings & enquiries',
    contactHeading: 'Let’s create something beautiful together.',
  };

  var DEFAULT_CONTACT_HEADING_RUNS = [
    { text: 'Let’s create something ' },
    { text: 'beautiful', italic: true },
    { text: ' together.' },
  ];

  var SIZE_EM = { sm: '0.86em', md: '1em', lg: '1.2em', xl: '1.42em' };
  var SIZE_SCALE = { sm: 0.86, md: 1, lg: 1.18, xl: 1.38 };

  var S = {
    token: sessionStorage.getItem('admin.token') || '',
    models: [],
    slug: '',
    isNew: false,
    model: null,
    sha: null,
    saved: '',
    pendingDeletes: [],
    savedSelections: {}, // richKey -> { startPara, startOffset, endPara, endOffset, collapsed }
    uploads: {},         // slotId -> { state, title, detail, percent, indeterminate, canCancel }
    activeUploadSlot: '',
    abortUpload: null,
    busy: false,
  };

  var $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isHttp(value) { return /^https?:\/\//i.test(String(value || '')); }

  function mediaSrc(file) {
    if (isHttp(file)) return file;
    return '../' + encodeURIComponent(S.slug) + '/media/' + encodeURIComponent(file);
  }

  function fontById(id) {
    for (var i = 0; i < FONT_CATALOG.length; i++) {
      if (FONT_CATALOG[i].id === id) return FONT_CATALOG[i];
    }
    return null;
  }

  function slotByKey(key) {
    for (var i = 0; i < FONT_SLOTS.length; i++) {
      if (FONT_SLOTS[i].key === key) return FONT_SLOTS[i];
    }
    return FONT_SLOTS[0];
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

  // ---- Run & profile normalisation --------------------------------------

  function trimmed(value) { return typeof value === 'string' ? value.trim() : value; }

  function cloneRuns(runs) {
    return JSON.parse(JSON.stringify(runs));
  }

  function hasInlineFormatting(runs) {
    if (!Array.isArray(runs)) return false;
    return runs.some(function (r) {
      return r && (r.family || r.size || r.bold || r.italic || r.underline || r.color);
    });
  }

  function runsToPlain(runs) {
    if (!Array.isArray(runs)) return '';
    return runs.map(function (r) { return (r && r.text) || ''; }).join('');
  }

  function normaliseRuns(runs) {
    var out = [];
    (runs || []).forEach(function (raw) {
      if (!raw || typeof raw.text !== 'string' || !raw.text.length) return;
      var clean = { text: raw.text };
      if (raw.family && fontById(raw.family)) clean.family = raw.family;
      if (raw.size && SIZE_EM[raw.size] && raw.size !== 'md') clean.size = raw.size;
      if (raw.bold === true) clean.bold = true;
      if (raw.italic === true) clean.italic = true;
      if (raw.underline === true) clean.underline = true;
      if (raw.color && /^#[0-9a-fA-F]{6}$/.test(raw.color)) clean.color = raw.color.toLowerCase();
      var prev = out[out.length - 1];
      if (prev && sameRunStyle(prev, clean)) {
        prev.text += clean.text;
      } else {
        out.push(clean);
      }
    });
    return out;
  }

  function sameRunStyle(a, b) {
    return (a.family || '') === (b.family || '') &&
      (a.size || '') === (b.size || '') &&
      Boolean(a.bold) === Boolean(b.bold) &&
      Boolean(a.italic) === Boolean(b.italic) &&
      Boolean(a.underline) === Boolean(b.underline) &&
      (a.color || '') === (b.color || '');
  }

  function isDefaultContactRuns(runs) {
    var norm = normaliseRuns(runs);
    return JSON.stringify(norm) === JSON.stringify(DEFAULT_CONTACT_HEADING_RUNS);
  }

  function blankProfile(slug, name) {
    return {
      slug: slug,
      name: name,
      bio: [],
      stats: [],
      fonts: {},
      texts: {},
      richText: {},
      cover: [],
      photos: [],
      videos: [],
      contact: {},
    };
  }

  function normalise(model) {
    var m = JSON.parse(JSON.stringify(model));
    m.cover = Array.isArray(m.cover) ? m.cover : (m.cover ? [m.cover] : []);
    m.photos = Array.isArray(m.photos) ? m.photos : [];
    m.videos = Array.isArray(m.videos) ? m.videos : [];
    m.bio = Array.isArray(m.bio) ? m.bio : [];
    m.stats = Array.isArray(m.stats) ? m.stats : [];
    m.contact = m.contact || {};
    m.fonts = (m.fonts && typeof m.fonts === 'object' && !Array.isArray(m.fonts)) ? m.fonts : {};
    m.texts = (m.texts && typeof m.texts === 'object' && !Array.isArray(m.texts)) ? m.texts : {};
    m.richText = (m.richText && typeof m.richText === 'object' && !Array.isArray(m.richText)) ? m.richText : {};

    // Pre-populate the default italicised word in Contact heading when untouched.
    if (!m.richText.contactHeading && !m.texts.contactHeading) {
      m.richText.contactHeading = cloneRuns(DEFAULT_CONTACT_HEADING_RUNS);
    }
    return m;
  }

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

  function cleanProfile(m) {
    var out = {};
    Object.keys(m).forEach(function (k) { out[k] = m[k]; });
    out.name = trimmed(m.name);
    setOrDelete(out, 'tagline', trimmed(m.tagline));

    var bio = [];
    var bioRich = [];
    var srcBioRich = Array.isArray(m.richText && m.richText.bio) ? m.richText.bio : [];
    (m.bio || []).forEach(function (para, idx) {
      var t = trimmed(para);
      if (!t) return;
      bio.push(t);
      var r = normaliseRuns(srcBioRich[idx]);
      bioRich.push(r.length && trimmed(runsToPlain(r)) === t ? r : [{ text: t }]);
    });
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

    // Clean box-level font settings.
    var fonts = {};
    if (m.fonts && typeof m.fonts === 'object') {
      FONT_SLOTS.forEach(function (slot) {
        var raw = m.fonts[slot.key];
        if (!raw || typeof raw !== 'object') return;
        var f = {};
        if (raw.family && fontById(raw.family)) f.family = raw.family;
        if (raw.style === 'normal' || raw.style === 'italic') f.style = raw.style;
        if (raw.weight && ['300', '400', '500', '600', '700'].indexOf(String(raw.weight)) !== -1) {
          f.weight = String(raw.weight);
        }
        if (raw.size && ['sm', 'lg', 'xl'].indexOf(raw.size) !== -1) f.size = raw.size;
        if (raw.underline === true) f.underline = true;
        if (raw.color && /^#[0-9a-fA-F]{6}$/.test(raw.color)) f.color = raw.color.toLowerCase();
        if (raw.align && ['left', 'center', 'right'].indexOf(raw.align) !== -1) f.align = raw.align;
        if (Object.keys(f).length) fonts[slot.key] = f;
      });
    }
    setOrDelete(out, 'fonts', Object.keys(fonts).length ? fonts : null);

    // Clean custom section texts and inline richText runs.
    var texts = {};
    var richText = {};
    var singleKeys = ['name', 'aboutLabel', 'portfolioLabel', 'portfolioHeading', 'videosLabel', 'videosHeading', 'contactLabel', 'contactHeading'];

    singleKeys.forEach(function (key) {
      var defaultText = key === 'name' ? out.name : DEFAULT_TEXTS[key];
      var plain = key === 'name'
        ? out.name
        : (trimmed(m.texts && m.texts[key]) || defaultText);
      var rawRuns = m.richText && m.richText[key];
      var norm = normaliseRuns(rawRuns);

      if (key === 'contactHeading' && plain === DEFAULT_TEXTS.contactHeading && (!norm.length || isDefaultContactRuns(norm))) {
        return;
      }
      if (key !== 'name' && plain !== defaultText) {
        texts[key] = plain;
      }
      if (norm.length && hasInlineFormatting(norm) && trimmed(runsToPlain(norm)) === plain) {
        richText[key] = norm;
      } else if (key === 'contactHeading' && plain === DEFAULT_TEXTS.contactHeading && norm.length && !hasInlineFormatting(norm)) {
        // User explicitly cleared the default italic on "beautiful" -> store plain text override.
        texts.contactHeading = plain;
      }
    });

    if (bio.length && bioRich.some(hasInlineFormatting)) {
      richText.bio = bioRich;
    }

    setOrDelete(out, 'texts', Object.keys(texts).length ? texts : null);
    setOrDelete(out, 'richText', Object.keys(richText).length ? richText : null);
    return out;
  }

  function snapshot() { return JSON.stringify(cleanProfile(S.model)); }

  function isDirty() { return S.model && snapshot() !== S.saved; }

  // ---- Status and screens -----------------------------------------------

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
    if (S.abortUpload) S.abortUpload();
    S.token = '';
    sessionStorage.removeItem('admin.token');
    S.model = null;
    S.slug = '';
    S.uploads = {};
    S.activeUploadSlot = '';
    paintSavebarProgress();
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
      S.savedSelections = {};
      S.uploads = {};
      S.activeUploadSlot = '';
      paintSavebarProgress();
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
    S.model = normalise(blankProfile(slug, name));
    S.saved = '';
    S.pendingDeletes = [];
    S.savedSelections = {};
    S.uploads = {};
    S.activeUploadSlot = '';
    paintSavebarProgress();
    renderPicker();
    setStatus('New profile. Add at least one cover photo, then save.');
    render();
  }

  // ---- Resolved box styles & HTML rendering -----------------------------

  function resolvedSlotStyle(slotKey) {
    var slot = slotByKey(slotKey);
    var spec = (S.model && S.model.fonts && S.model.fonts[slotKey]) || {};
    var fallback = slotKey !== 'name' && slotKey !== 'bio' && slotKey !== 'stats' && slotKey !== 'captions' && slotKey !== 'contact'
      ? ((S.model && S.model.fonts && S.model.fonts.headings) || {})
      : {};
    var familyId = spec.family || fallback.family || slot.defaultFamily;
    var entry = fontById(familyId) || FONT_CATALOG[0];
    var style = spec.style || fallback.style || slot.defaultStyle;
    var weight = String(spec.weight || fallback.weight || slot.defaultWeight);
    var size = spec.size || 'md';
    var underline = Boolean(spec.underline);
    var color = spec.color || '';
    var align = spec.align || '';
    return {
      familyId: spec.family || '',
      resolvedFamilyId: familyId,
      stack: entry.stack,
      style: style,
      weight: weight,
      bold: Number(weight) >= 600,
      italic: style === 'italic',
      size: size,
      scale: SIZE_SCALE[size] || 1,
      underline: underline,
      color: color,
      displayColor: color || slot.defaultColor,
      align: align,
    };
  }

  function boxInlineCss(slotKey, baseRem) {
    var r = resolvedSlotStyle(slotKey);
    var css = [
      'font-family:' + r.stack,
      'font-style:' + r.style,
      'font-weight:' + r.weight,
      'text-decoration:' + (r.underline ? 'underline' : 'none'),
    ];
    if (baseRem) {
      css.push('font-size:' + (baseRem * r.scale).toFixed(2) + 'rem');
    } else if (r.scale !== 1) {
      css.push('font-size:' + Math.round(r.scale * 100) + '%');
    }
    if (r.color) css.push('color:' + r.color);
    if (r.align) css.push('text-align:' + r.align);
    return css.join(';');
  }

  function familySelectOptions(selectedId, defaultId) {
    var def = fontById(defaultId);
    var html = '<option value="">Default (' + esc(def ? def.label : defaultId) + ')</option>';
    var cats = [];
    FONT_CATALOG.forEach(function (f) {
      if (cats.indexOf(f.category) === -1) cats.push(f.category);
    });
    cats.forEach(function (cat) {
      html += '<optgroup label="' + esc(cat) + '">';
      FONT_CATALOG.filter(function (f) { return f.category === cat; }).forEach(function (f) {
        html += '<option value="' + esc(f.id) + '"' + (f.id === selectedId ? ' selected' : '') + '>' + esc(f.label) + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function sizeSelectOptions(selectedSize) {
    var cur = selectedSize || 'md';
    var opts = [
      ['sm', 'Small'],
      ['md', 'Normal'],
      ['lg', 'Large'],
      ['xl', 'Huge'],
    ];
    return opts.map(function (pair) {
      return '<option value="' + pair[0] + '"' + (cur === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
    }).join('');
  }

  function formatToolbarInnerHtml(opts) {
    var slot = slotByKey(opts.slot);
    var r = resolvedSlotStyle(opts.slot);
    var richAttr = opts.richKey ? ' data-target-rich="' + esc(opts.richKey) + '"' : '';
    var tag = opts.tagLabel ? '<span class="composer-bar-tag">' + esc(opts.tagLabel) + '</span>' : '';
    var alignBtns = opts.alignable
      ? '<span class="fmt-sep" aria-hidden="true"></span>' +
        '<button type="button" class="fmt-btn' + (r.align === 'left' || !r.align ? ' is-active' : '') + '" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="align" data-val="left" title="Align left" aria-label="Align left">⇤</button>' +
        '<button type="button" class="fmt-btn' + (r.align === 'center' ? ' is-active' : '') + '" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="align" data-val="center" title="Align center" aria-label="Align center">⇔</button>' +
        '<button type="button" class="fmt-btn' + (r.align === 'right' ? ' is-active' : '') + '" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="align" data-val="right" title="Align right" aria-label="Align right">⇥</button>'
      : '';

    return tag +
      '<select class="fmt-select fmt-font" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="family" aria-label="Font family" title="Font family">' +
        familySelectOptions(r.familyId, slot.defaultFamily) +
      '</select>' +
      '<select class="fmt-select fmt-size" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="size" aria-label="Font size" title="Text size">' +
        sizeSelectOptions(r.size) +
      '</select>' +
      '<span class="fmt-sep" aria-hidden="true"></span>' +
      '<button type="button" class="fmt-btn' + (r.bold ? ' is-active' : '') + '" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="bold" title="Bold (select text or format box)" aria-label="Bold"><b>B</b></button>' +
      '<button type="button" class="fmt-btn' + (r.italic ? ' is-active' : '') + '" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="italic" title="Italic (select text or format box)" aria-label="Italic"><i>I</i></button>' +
      '<button type="button" class="fmt-btn' + (r.underline ? ' is-active' : '') + '" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="underline" title="Underline (select text or format box)" aria-label="Underline"><u>U</u></button>' +
      '<label class="fmt-btn fmt-color" title="Text colour">' +
        '<span class="fmt-color-a">A</span>' +
        '<span class="fmt-color-bar" data-color-bar="' + esc(opts.slot) + '" style="background:' + esc(r.displayColor) + '"></span>' +
        '<input type="color" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="color" value="' + esc(r.displayColor) + '" aria-label="Text colour">' +
      '</label>' +
      alignBtns +
      '<span class="fmt-sep" aria-hidden="true"></span>' +
      '<button type="button" class="fmt-btn" data-slot="' + esc(opts.slot) + '"' + richAttr + ' data-fmt="clear" title="Clear formatting" aria-label="Clear formatting">T<sub>×</sub></button>';
  }

  function renderRunSpanHtml(run) {
    var html = esc(run.text);
    var attrs = [];
    var styles = [];
    if (run.family && fontById(run.family)) {
      attrs.push('data-family="' + esc(run.family) + '"');
      styles.push('font-family:' + fontById(run.family).stack);
    }
    if (run.size && SIZE_EM[run.size]) {
      attrs.push('data-size="' + esc(run.size) + '"');
      styles.push('font-size:' + SIZE_EM[run.size]);
    }
    if (run.bold) {
      attrs.push('data-bold="1"');
      styles.push('font-weight:700');
    }
    if (run.italic) {
      attrs.push('data-italic="1"');
      styles.push('font-style:italic');
    }
    if (run.underline) {
      attrs.push('data-underline="1"');
      styles.push('text-decoration:underline');
    }
    if (run.color && /^#[0-9a-fA-F]{6}$/.test(run.color)) {
      attrs.push('data-color="' + esc(run.color) + '"');
      styles.push('color:' + run.color);
    }
    if (!attrs.length) return html;
    return '<span ' + attrs.join(' ') + ' style="' + esc(styles.join(';')) + '">' + html + '</span>';
  }

  function renderEditorInnerHtml(paragraphs, multiline) {
    if (!multiline) {
      var single = (paragraphs && paragraphs[0]) || [];
      return single.map(renderRunSpanHtml).join('');
    }
    if (!paragraphs || !paragraphs.length) return '<p><br></p>';
    return paragraphs.map(function (runs) {
      var inner = (runs || []).map(renderRunSpanHtml).join('');
      return '<p>' + (inner || '<br>') + '</p>';
    }).join('');
  }

  function initialParagraphsFor(richKey) {
    var m = S.model;
    if (richKey === 'bio') {
      var bioRich = Array.isArray(m.richText && m.richText.bio) ? m.richText.bio : [];
      if (!m.bio.length) return [];
      return m.bio.map(function (p, idx) {
        var r = normaliseRuns(bioRich[idx]);
        return r.length && trimmed(runsToPlain(r)) === trimmed(p) ? r : [{ text: p }];
      });
    }
    var plain = richKey === 'name'
      ? (m.name || '')
      : ((m.texts && m.texts[richKey]) || DEFAULT_TEXTS[richKey] || '');
    var rSingle = normaliseRuns(m.richText && m.richText[richKey]);
    if (rSingle.length && trimmed(runsToPlain(rSingle)) === trimmed(plain)) {
      return [rSingle];
    }
    return plain ? [[{ text: plain }]] : [];
  }

  function composerBoxHtml(opts) {
    var paras = initialParagraphsFor(opts.richKey);
    var inner = renderEditorInnerHtml(paras, opts.multiline);
    var isEmpty = !paras.length || !trimmed(runsToPlain(paras[0]));
    var cls = 'composer-editor ' + (opts.multiline ? 'is-multiline' : 'is-single') +
      (opts.editorClass ? ' ' + opts.editorClass : '');
    return '<div class="composer-field' + (opts.full ? ' full' : '') + '">' +
      '<div class="composer-label"><span>' + esc(opts.label) + '</span>' +
        (opts.hint ? '<span class="hint">' + esc(opts.hint) + '</span>' : '') +
      '</div>' +
      '<div class="composer' + (opts.dark ? ' composer--dark' : '') + '" data-composer="' + esc(opts.slot) + '">' +
        '<div class="composer-bar" data-toolbar="' + esc(opts.slot) + '">' +
          formatToolbarInnerHtml(opts) +
        '</div>' +
        '<div class="' + cls + '" contenteditable="true" spellcheck="true"' +
          ' data-rich-key="' + esc(opts.richKey) + '"' +
          ' data-slot="' + esc(opts.slot) + '"' +
          ' data-base-rem="' + (opts.baseRem || '') + '"' +
          ' data-multiline="' + (opts.multiline ? '1' : '0') + '"' +
          ' data-placeholder="' + esc(opts.placeholder || '') + '"' +
          ' data-empty="' + (isEmpty ? '1' : '0') + '"' +
          ' style="' + esc(boxInlineCss(opts.slot, opts.baseRem)) + '">' +
          inner +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function groupFormatBarHtml(slotKey, tagLabel) {
    return '<div class="composer-bar composer-bar--standalone" data-toolbar="' + esc(slotKey) + '">' +
      formatToolbarInnerHtml({ slot: slotKey, tagLabel: tagLabel }) +
    '</div>';
  }

  function field(label, path, value, extra, styledSlot) {
    var styleAttr = styledSlot ? ' data-styled-slot="' + esc(styledSlot) + '" style="' + esc(boxInlineCss(styledSlot)) + '"' : '';
    return '<label>' + esc(label) +
      '<input data-field="' + esc(path) + '" value="' + esc(value) + '"' + styleAttr + (extra || '') + '></label>';
  }

  function formatBytes(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  function renderUploadPanelHtml(slotId, info) {
    if (!info) return '';
    var cls = 'upload-panel' +
      (info.state === 'done' ? ' is-done' : '') +
      (info.state === 'error' ? ' is-error' : '');
    var pct = Math.max(0, Math.min(100, Math.round(info.percent || 0)));
    var actionBtn = '';
    if (info.state === 'uploading' && info.canCancel) {
      actionBtn = '<button type="button" class="btn small ghost" data-action="cancel-upload" data-slot-id="' + esc(slotId) + '">Cancel</button>';
    } else if (info.state === 'error' || info.state === 'done') {
      actionBtn = '<button type="button" class="btn small ghost" data-action="dismiss-upload" data-slot-id="' + esc(slotId) + '">Dismiss</button>';
    }
    var track = info.state === 'error'
      ? ''
      : '<div class="upload-track' + (info.indeterminate ? ' is-indeterminate' : '') + '" role="progressbar"' +
          ' aria-valuemin="0" aria-valuemax="100"' +
          (info.indeterminate ? '' : ' aria-valuenow="' + pct + '"') + '>' +
          '<div class="upload-fill" style="width:' + (info.indeterminate ? 38 : pct) + '%"></div>' +
        '</div>';
    return '<div class="' + cls + '" role="status" aria-live="polite">' +
      '<div class="upload-head">' +
        '<span class="upload-title">' + esc(info.title || '') + '</span>' +
        '<span class="upload-meta"><span>' + esc(info.detail || '') + '</span>' + actionBtn + '</span>' +
      '</div>' +
      track +
    '</div>';
  }

  function uploadSlotHtml(slotId) {
    return '<div class="upload-slot" data-upload-slot="' + esc(slotId) + '">' +
      renderUploadPanelHtml(slotId, S.uploads[slotId]) +
    '</div>';
  }

  function paintUploadSlot(slotId) {
    var root = $('editor-body');
    if (root) {
      var slotEl = root.querySelector('[data-upload-slot="' + slotId + '"]');
      if (slotEl) slotEl.innerHTML = renderUploadPanelHtml(slotId, S.uploads[slotId]);
    }
    paintSavebarProgress();
  }

  function paintSavebarProgress() {
    var bar = $('savebar-progress');
    if (!bar) return;
    var active = S.activeUploadSlot && S.uploads[S.activeUploadSlot];
    if (!active || active.state !== 'uploading') {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    var pct = Math.max(0, Math.min(100, Math.round(active.percent || 0)));
    bar.hidden = false;
    bar.innerHTML =
      '<div class="savebar-progress-head">' +
        '<span>' + esc(active.title || 'Uploading…') + '</span>' +
        '<span>' + esc(active.detail || '') + '</span>' +
      '</div>' +
      '<div class="upload-track' + (active.indeterminate ? ' is-indeterminate' : '') + '" role="progressbar"' +
        ' aria-valuemin="0" aria-valuemax="100"' +
        (active.indeterminate ? '' : ' aria-valuenow="' + pct + '"') + '>' +
        '<div class="upload-fill" style="width:' + (active.indeterminate ? 38 : pct) + '%"></div>' +
      '</div>';
  }

  function thumbBoxHtml(mediaHtml, loadingLabel) {
    return '<div class="thumb-box is-loading">' +
      mediaHtml +
      '<div class="thumb-loader">' +
        '<span data-thumb-status>' + esc(loadingLabel || 'Loading…') + '</span>' +
        '<div class="thumb-loader-bar"></div>' +
      '</div>' +
    '</div>';
  }

  function syncMediaLoadStates() {
    var root = $('editor-body');
    if (!root) return;
    var boxes = root.querySelectorAll('.thumb-box');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var img = box.querySelector('img');
      if (img && img.complete) {
        box.classList.remove('is-loading');
        if (img.naturalWidth === 0) {
          box.classList.add('is-error');
          var st = box.querySelector('[data-thumb-status]');
          if (st) st.textContent = 'Preview unavailable';
        }
      }
      var vid = box.querySelector('video');
      if (vid && vid.readyState >= 1) {
        box.classList.remove('is-loading');
      }
    }
  }

  function listCard(title, addControl, body, uploadSlotId) {
    return '<section class="card"><div class="toolbar"><h2>' + esc(title) + '</h2>' + addControl + '</div>' +
      (uploadSlotId ? uploadSlotHtml(uploadSlotId) : '') +
      body + '</section>';
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
    var uploading = Boolean(S.activeUploadSlot);
    return '<label class="btn small file-btn' + (uploading ? ' is-uploading' : '') + '">' + esc(label) +
      '<input type="file" data-upload="' + kind + '"' + (uploading ? ' disabled' : '') + (extra || '') + '></label>';
  }

  function coverHtml() {
    return S.model.cover.map(function (c, i) {
      return '<div class="item">' +
        thumbBoxHtml('<img class="thumb" alt="" src="' + esc(mediaSrc(c.file)) + '" loading="lazy">', 'Loading photo…') +
        '<div><div class="item-fields">' +
        '<label class="full">Alt text (describe the photo for screen readers)' +
        '<input data-list="cover" data-i="' + i + '" data-key="alt" value="' + esc(c.alt) + '"></label>' +
        '</div><div class="item-actions">' + moveButtons('cover', i, S.model.cover.length) + removeButton('cover', i) +
        '</div></div></div>';
    }).join('') || '<p class="muted">No cover photos yet. The first one is shown first on the site.</p>';
  }

  function photosHtml() {
    var captionStyle = esc(boxInlineCss('captions'));
    return S.model.photos.map(function (p, i) {
      return '<div class="item">' +
        thumbBoxHtml('<img class="thumb" alt="" src="' + esc(mediaSrc(p.file)) + '" loading="lazy">', 'Loading photo…') +
        '<div><div class="item-fields">' +
        '<label>Title<input data-list="photos" data-i="' + i + '" data-key="title" value="' + esc(p.title) + '"></label>' +
        '<label>Category (filter &amp; caption)<input data-list="photos" data-i="' + i + '" data-key="category" data-styled-slot="captions" style="' + captionStyle + '" value="' + esc(p.category) + '"></label>' +
        '<label>Year<input data-list="photos" data-i="' + i + '" data-key="year" data-styled-slot="captions" style="' + captionStyle + '" value="' + esc(p.year) + '"></label>' +
        '<label>Alt text<input data-list="photos" data-i="' + i + '" data-key="alt" value="' + esc(p.alt) + '"></label>' +
        '</div><div class="item-actions">' + moveButtons('photos', i, S.model.photos.length) + removeButton('photos', i) +
        '</div></div></div>';
    }).join('') || '<p class="muted">No portfolio photos yet.</p>';
  }

  function videosHtml() {
    var videoStyle = esc(boxInlineCss('videoText'));
    var captionStyle = esc(boxInlineCss('captions'));
    return S.model.videos.map(function (v, i) {
      var preview = v.poster
        ? thumbBoxHtml('<img class="thumb wide" alt="" src="' + esc(mediaSrc(v.poster)) + '" loading="lazy">', 'Loading poster…')
        : (v.file
          ? thumbBoxHtml('<video class="thumb wide" preload="metadata" muted playsinline src="' + esc(mediaSrc(v.file)) + '#t=0.001"></video>', 'Loading video…')
          : '<div class="thumb-box"><div class="thumb wide" aria-hidden="true"></div></div>');
      return '<div class="item video">' + preview +
        '<div><div class="item-fields">' +
        '<label>Title<input data-list="videos" data-i="' + i + '" data-key="title" data-styled-slot="videoText" style="' + videoStyle + '" value="' + esc(v.title) + '"></label>' +
        '<label>Category<input data-list="videos" data-i="' + i + '" data-key="category" data-styled-slot="captions" style="' + captionStyle + '" value="' + esc(v.category) + '"></label>' +
        '<label class="full">Description<input data-list="videos" data-i="' + i + '" data-key="description" data-styled-slot="videoText" style="' + videoStyle + '" value="' + esc(v.description) + '"></label>' +
        '</div><p class="muted">Video: ' + esc(v.file ? (isHttp(v.file) ? 'hosted' : v.file) : '') + '</p>' +
        uploadSlotHtml('poster-' + i) +
        '<div class="item-actions">' + uploadButton(v.poster ? 'Replace poster image' : 'Add poster image', 'poster', ' accept="image/*" data-i="' + i + '"') +
        moveButtons('videos', i, S.model.videos.length) + removeButton('videos', i) + '</div></div></div>';
    }).join('') || '<p class="muted">No videos yet.</p>';
  }

  function statsHtml() {
    var statStyle = esc(boxInlineCss('stats'));
    return S.model.stats.map(function (s, i) {
      return '<div class="stat-row">' +
        '<label>Label<input data-list="stats" data-i="' + i + '" data-key="label" data-styled-slot="stats" style="' + statStyle + '" value="' + esc(s.label) + '"></label>' +
        '<label>Value<input data-list="stats" data-i="' + i + '" data-key="value" data-styled-slot="stats" style="' + statStyle + '" value="' + esc(s.value) + '"></label>' +
        removeButton('stats', i) + '</div>';
    }).join('') || '<p class="muted">No measurements yet.</p>';
  }

  function render() {
    ensurePreviewFonts();
    var m = S.model;
    var contact = m.contact || {};
    var seo = m.seo || {};
    $('editor-body').innerHTML = [
      '<section class="card"><h2>Profile &amp; About</h2><div class="stack">',
      composerBoxHtml({
        richKey: 'name',
        slot: 'name',
        label: 'Name',
        hint: 'Shown in the top header; select words or use the bar to style the box',
        multiline: false,
        editorClass: 'composer-editor--name',
        baseRem: 1.55,
        placeholder: 'Model name',
      }),
      composerBoxHtml({
        richKey: 'aboutLabel',
        slot: 'aboutLabel',
        label: 'About section label',
        multiline: false,
        alignable: true,
        editorClass: 'composer-editor--label',
        baseRem: 0.82,
        placeholder: DEFAULT_TEXTS.aboutLabel,
      }),
      composerBoxHtml({
        richKey: 'bio',
        slot: 'bio',
        label: 'About (biography)',
        hint: 'Press Enter for a new paragraph; highlight words to style them like an email',
        multiline: true,
        alignable: true,
        baseRem: 1,
        placeholder: 'Write the model’s biography here…',
      }),
      '<div class="subhead">Search &amp; browser tab metadata</div>',
      '<div class="grid">',
      field('Browser tab tagline (optional)', 'tagline', m.tagline || ''),
      field('Search description (optional)', 'seo.description', seo.description || ''),
      '<label class="full" style="display:flex;gap:8px;align-items:center">' +
        '<input type="checkbox" data-field="seo.noindex"' + (seo.noindex ? ' checked' : '') + ' style="width:auto"> Hide this page from search engines</label>',
      '</div></div></section>',

      listCard(
        'Measurements',
        '<button type="button" class="btn small" data-action="add-stat">Add row</button>',
        groupFormatBarHtml('stats', 'Measurements font:') + statsHtml()
      ),

      '<section class="card"><h2>Contact</h2><div class="stack">',
      composerBoxHtml({
        richKey: 'contactLabel',
        slot: 'contactLabel',
        label: 'Contact section label',
        multiline: false,
        alignable: true,
        dark: true,
        editorClass: 'composer-editor--label',
        baseRem: 0.82,
        placeholder: DEFAULT_TEXTS.contactLabel,
      }),
      composerBoxHtml({
        richKey: 'contactHeading',
        slot: 'contactHeading',
        label: 'Contact heading',
        hint: 'Shown on the dark Contact banner',
        multiline: false,
        alignable: true,
        dark: true,
        editorClass: 'composer-editor--heading',
        baseRem: 1.45,
        placeholder: DEFAULT_TEXTS.contactHeading,
      }),
      '<div class="subhead">Contact links &amp; details</div>',
      groupFormatBarHtml('contact', 'Contact details font:'),
      '<div class="grid">',
      field('Email', 'contact.email', contact.email || '', '', 'contact'),
      field('Phone', 'contact.phone', contact.phone || '', '', 'contact'),
      field('WhatsApp number', 'contact.whatsapp', contact.whatsapp || ''),
      field('Instagram (full link)', 'contact.instagram', contact.instagram || '', '', 'contact'),
      field('LinkedIn (full link)', 'contact.linkedin', contact.linkedin || '', '', 'contact'),
      field('TikTok (full link)', 'contact.tiktok', contact.tiktok || '', '', 'contact'),
      field('IMDb (full link)', 'contact.imdb', contact.imdb || '', '', 'contact'),
      field('Website (full link)', 'contact.website', contact.website || '', '', 'contact'),
      '</div></div></section>',

      listCard('Cover photos (hero slideshow)', uploadButton('Add cover photo', 'cover', ' accept="image/*" multiple'), '<div class="list">' + coverHtml() + '</div>', 'cover'),

      listCard(
        'Portfolio photos',
        uploadButton('Add photo', 'photo', ' accept="image/*" multiple'),
        '<div class="stack">' +
          '<div class="grid">' +
            composerBoxHtml({
              richKey: 'portfolioLabel',
              slot: 'portfolioLabel',
              label: 'Section label',
              multiline: false,
              alignable: true,
              editorClass: 'composer-editor--label',
              baseRem: 0.82,
              placeholder: DEFAULT_TEXTS.portfolioLabel,
            }) +
            composerBoxHtml({
              richKey: 'portfolioHeading',
              slot: 'portfolioHeading',
              label: 'Section heading',
              multiline: false,
              alignable: true,
              editorClass: 'composer-editor--heading',
              baseRem: 1.45,
              placeholder: DEFAULT_TEXTS.portfolioHeading,
            }) +
          '</div>' +
          groupFormatBarHtml('captions', 'Captions & filters font:') +
          '<div class="list">' + photosHtml() + '</div>' +
        '</div>',
        'photo'
      ),

      listCard(
        'Videos',
        uploadButton('Add video', 'video', ' accept="video/*" multiple'),
        '<div class="stack">' +
          '<div class="grid">' +
            composerBoxHtml({
              richKey: 'videosLabel',
              slot: 'videosLabel',
              label: 'Section label',
              multiline: false,
              alignable: true,
              editorClass: 'composer-editor--label',
              baseRem: 0.82,
              placeholder: DEFAULT_TEXTS.videosLabel,
            }) +
            composerBoxHtml({
              richKey: 'videosHeading',
              slot: 'videosHeading',
              label: 'Section heading',
              multiline: false,
              alignable: true,
              editorClass: 'composer-editor--heading',
              baseRem: 1.45,
              placeholder: DEFAULT_TEXTS.videosHeading,
            }) +
          '</div>' +
          groupFormatBarHtml('videoText', 'Video titles & descriptions font:') +
          '<div class="list">' + videosHtml() + '</div>' +
        '</div>',
        'video'
      ),
    ].join('');
    syncMediaLoadStates();
    updateDirtyNote();
  }

  // ---- Rich-text DOM parser & character-offset selection engine ----------

  function extractInlineRunsFromNode(rootNode, editorEl) {
    var rawRuns = [];
    function walk(node, inherited) {
      if (!node) return;
      if (node.nodeType === 3) {
        var txt = node.nodeValue.replace(/\u00a0/g, ' ');
        if (txt.length) {
          var run = { text: txt };
          if (inherited.family) run.family = inherited.family;
          if (inherited.size) run.size = inherited.size;
          if (inherited.bold) run.bold = true;
          if (inherited.italic) run.italic = true;
          if (inherited.underline) run.underline = true;
          if (inherited.color) run.color = inherited.color;
          rawRuns.push(run);
        }
        return;
      }
      if (node.nodeType !== 1) return;
      var tag = node.tagName.toUpperCase();
      if (tag === 'BR') return;
      var next = {
        family: inherited.family,
        size: inherited.size,
        bold: inherited.bold,
        italic: inherited.italic,
        underline: inherited.underline,
        color: inherited.color,
      };
      if (node !== editorEl) {
        if (tag === 'B' || tag === 'STRONG') next.bold = true;
        if (tag === 'I' || tag === 'EM') next.italic = true;
        if (tag === 'U') next.underline = true;
        var df = node.getAttribute('data-family');
        if (df && fontById(df)) next.family = df;
        var ds = node.getAttribute('data-size');
        if (ds && SIZE_EM[ds]) next.size = ds;
        if (node.getAttribute('data-bold') === '1') next.bold = true;
        if (node.getAttribute('data-italic') === '1') next.italic = true;
        if (node.getAttribute('data-underline') === '1') next.underline = true;
        var dc = node.getAttribute('data-color');
        if (dc && /^#[0-9a-fA-F]{6}$/.test(dc)) next.color = dc.toLowerCase();
      }
      for (var i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i], next);
      }
    }
    walk(rootNode, {});
    return normaliseRuns(rawRuns);
  }

  function getParagraphBlocks(editorEl) {
    if (editorEl.getAttribute('data-multiline') !== '1') return [editorEl];
    var blocks = [];
    for (var i = 0; i < editorEl.childNodes.length; i++) {
      var child = editorEl.childNodes[i];
      if (child.nodeType === 1 && (child.tagName === 'P' || child.tagName === 'DIV')) {
        blocks.push(child);
      }
    }
    return blocks.length ? blocks : [editorEl];
  }

  function readEditorParagraphs(editorEl) {
    return getParagraphBlocks(editorEl).map(function (block) {
      return extractInlineRunsFromNode(block, editorEl);
    });
  }

  function syncEditorToModel(editorEl) {
    if (!S.model) return;
    var key = editorEl.getAttribute('data-rich-key');
    var paras = readEditorParagraphs(editorEl);
    var isEmpty = !paras.length || paras.every(function (r) { return !trimmed(runsToPlain(r)); });
    editorEl.setAttribute('data-empty', isEmpty ? '1' : '0');

    if (key === 'bio') {
      var bioPlain = [];
      var bioRuns = [];
      paras.forEach(function (runs) {
        var plain = trimmed(runsToPlain(runs));
        if (!plain) return;
        bioPlain.push(plain);
        bioRuns.push(trimRunsEdges(runs));
      });
      S.model.bio = bioPlain;
      if (bioRuns.some(hasInlineFormatting)) S.model.richText.bio = bioRuns;
      else delete S.model.richText.bio;
      return;
    }

    var singleRuns = trimRunsEdges((paras[0] || []).map(function (r) {
      return Object.assign({}, r, { text: r.text.replace(/[\r\n]+/g, ' ') });
    }));
    var plainText = trimmed(runsToPlain(singleRuns));

    if (key === 'name') {
      S.model.name = plainText;
    } else {
      if (!S.model.texts) S.model.texts = {};
      if (plainText) S.model.texts[key] = plainText;
      else delete S.model.texts[key];
    }

    if (singleRuns.length && hasInlineFormatting(singleRuns)) {
      S.model.richText[key] = singleRuns;
    } else {
      delete S.model.richText[key];
    }
  }

  function trimRunsEdges(runs) {
    var list = normaliseRuns(runs);
    while (list.length) {
      list[0].text = list[0].text.replace(/^\s+/, '');
      if (list[0].text) break;
      list.shift();
    }
    while (list.length) {
      var last = list[list.length - 1];
      last.text = last.text.replace(/\s+$/, '');
      if (last.text) break;
      list.pop();
    }
    return list;
  }

  // Measures a DOM boundary (container, offset) as { para, offset } inside editorEl.
  function measurePoint(editorEl, container, offset) {
    var blocks = getParagraphBlocks(editorEl);
    for (var p = 0; p < blocks.length; p++) {
      var block = blocks[p];
      if (block === container || block.contains(container)) {
        var range = document.createRange();
        range.selectNodeContents(block);
        range.setEnd(container, offset);
        return { para: p, offset: range.toString().length };
      }
    }
    return { para: 0, offset: 0 };
  }

  function captureSelection() {
    if (typeof window.getSelection !== 'function') return;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    var anchorEl = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    var editorEl = anchorEl && anchorEl.closest ? anchorEl.closest('[data-rich-key]') : null;
    if (!editorEl) return;
    var key = editorEl.getAttribute('data-rich-key');
    var start = measurePoint(editorEl, range.startContainer, range.startOffset);
    var end = measurePoint(editorEl, range.endContainer, range.endOffset);
    S.savedSelections[key] = {
      startPara: start.para,
      startOffset: start.offset,
      endPara: end.para,
      endOffset: end.offset,
      collapsed: range.collapsed,
    };
    refreshToolbarForSlot(editorEl.getAttribute('data-slot'), editorEl);
  }

  function restorePoint(block, charOffset) {
    var walker = document.createTreeWalker(block, 4 /* SHOW_TEXT */);
    var rem = charOffset;
    var lastText = null;
    var node;
    while ((node = walker.nextNode())) {
      lastText = node;
      if (rem <= node.nodeValue.length) {
        return { node: node, offset: rem };
      }
      rem -= node.nodeValue.length;
    }
    if (lastText) return { node: lastText, offset: lastText.nodeValue.length };
    return { node: block, offset: 0 };
  }

  function restoreSelection(editorEl, saved) {
    if (!saved || typeof window.getSelection !== 'function') return;
    var blocks = getParagraphBlocks(editorEl);
    var bStart = blocks[Math.min(saved.startPara, blocks.length - 1)];
    var bEnd = blocks[Math.min(saved.endPara, blocks.length - 1)];
    if (!bStart || !bEnd) return;
    var p1 = restorePoint(bStart, saved.startOffset);
    var p2 = restorePoint(bEnd, saved.endOffset);
    var range = document.createRange();
    range.setStart(p1.node, p1.offset);
    range.setEnd(p2.node, p2.offset);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function splitRunsAt(runs, offset) {
    var out = [];
    var pos = 0;
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      var nextPos = pos + r.text.length;
      if (offset > pos && offset < nextPos) {
        var cut = offset - pos;
        out.push(Object.assign({}, r, { text: r.text.slice(0, cut) }));
        out.push(Object.assign({}, r, { text: r.text.slice(cut) }));
      } else {
        out.push(Object.assign({}, r));
      }
      pos = nextPos;
    }
    return out;
  }

  function applySelectionFormatting(editorEl, saved, prop, val) {
    var paras = readEditorParagraphs(editorEl);
    var selectedRuns = [];

    function collectOrMutate(mutateFn) {
      for (var p = saved.startPara; p <= saved.endPara && p < paras.length; p++) {
        var runs = paras[p];
        var len = runsToPlain(runs).length;
        var sOff = p === saved.startPara ? saved.startOffset : 0;
        var eOff = p === saved.endPara ? saved.endOffset : len;
        if (eOff <= sOff) continue;
        runs = splitRunsAt(runs, sOff);
        runs = splitRunsAt(runs, eOff);
        var pos = 0;
        runs.forEach(function (r) {
          var end = pos + r.text.length;
          if (pos >= sOff && end <= eOff) mutateFn(r);
          pos = end;
        });
        if (mutateFn !== collectPush) paras[p] = normaliseRuns(runs);
      }
    }

    function collectPush(r) { selectedRuns.push(r); }
    collectOrMutate(collectPush);
    if (!selectedRuns.length) return false;

    var toggleOff = false;
    if (prop === 'bold' || prop === 'italic' || prop === 'underline') {
      toggleOff = selectedRuns.every(function (r) { return Boolean(r[prop]); });
    }

    collectOrMutate(function (r) {
      if (prop === 'clear') {
        delete r.family; delete r.size; delete r.bold; delete r.italic; delete r.underline; delete r.color;
      } else if (prop === 'bold' || prop === 'italic' || prop === 'underline') {
        if (toggleOff) delete r[prop]; else r[prop] = true;
      } else if (prop === 'family') {
        if (val) r.family = val; else delete r.family;
      } else if (prop === 'size') {
        if (val && val !== 'md') r.size = val; else delete r.size;
      } else if (prop === 'color') {
        if (val) r.color = val.toLowerCase(); else delete r.color;
      }
    });

    editorEl.innerHTML = renderEditorInnerHtml(paras, editorEl.getAttribute('data-multiline') === '1');
    editorEl.focus();
    restoreSelection(editorEl, saved);
    syncEditorToModel(editorEl);
    refreshToolbarForSlot(editorEl.getAttribute('data-slot'), editorEl);
    updateDirtyNote();
    return true;
  }

  function applyBoxFormatting(slotKey, richKey, prop, val) {
    if (!S.model) return;
    if (!S.model.fonts) S.model.fonts = {};
    var spec = S.model.fonts[slotKey] || {};
    var cur = resolvedSlotStyle(slotKey);

    if (prop === 'clear') {
      delete S.model.fonts[slotKey];
      if (richKey) {
        delete S.model.richText[richKey];
        var edClear = $('editor-body').querySelector('[data-rich-key="' + richKey + '"]');
        if (edClear) {
          edClear.innerHTML = renderEditorInnerHtml(initialParagraphsFor(richKey), edClear.getAttribute('data-multiline') === '1');
        }
      }
    } else {
      if (prop === 'family') {
        if (val) spec.family = val; else delete spec.family;
      } else if (prop === 'size') {
        if (val && val !== 'md') spec.size = val; else delete spec.size;
      } else if (prop === 'bold') {
        spec.weight = cur.bold ? '400' : '700';
      } else if (prop === 'italic') {
        spec.style = cur.italic ? 'normal' : 'italic';
      } else if (prop === 'underline') {
        if (cur.underline) delete spec.underline; else spec.underline = true;
      } else if (prop === 'color') {
        if (val) spec.color = val.toLowerCase(); else delete spec.color;
      } else if (prop === 'align') {
        spec.align = val;
      }
      if (Object.keys(spec).length) S.model.fonts[slotKey] = spec;
      else delete S.model.fonts[slotKey];
    }

    refreshSlotStylesInDom(slotKey);
    updateDirtyNote();
  }

  function refreshSlotStylesInDom(slotKey) {
    var root = $('editor-body');
    var ed = root.querySelector('[data-rich-key][data-slot="' + slotKey + '"]');
    if (ed) {
      var baseRem = Number(ed.getAttribute('data-base-rem')) || 0;
      ed.setAttribute('style', boxInlineCss(slotKey, baseRem));
    }
    var inputs = root.querySelectorAll('[data-styled-slot="' + slotKey + '"]');
    var inputCss = boxInlineCss(slotKey);
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].setAttribute('style', inputCss);
    }
    refreshToolbarForSlot(slotKey, ed);
  }

  function activeRunAtCursor(editorEl) {
    if (!editorEl) return null;
    var key = editorEl.getAttribute('data-rich-key');
    var saved = S.savedSelections[key];
    if (!saved) return null;
    var paras = readEditorParagraphs(editorEl);
    var runs = paras[saved.startPara] || [];
    var pos = 0;
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      var next = pos + r.text.length;
      if (saved.startOffset >= pos && saved.startOffset <= next) return r;
      pos = next;
    }
    return null;
  }

  function refreshToolbarForSlot(slotKey, editorEl) {
    var bar = $('editor-body') && $('editor-body').querySelector('[data-toolbar="' + slotKey + '"]');
    if (!bar) return;
    var r = resolvedSlotStyle(slotKey);
    var run = activeRunAtCursor(editorEl);

    var fontSel = bar.querySelector('[data-fmt="family"]');
    if (fontSel) fontSel.value = (run && run.family) ? run.family : r.familyId;

    var sizeSel = bar.querySelector('[data-fmt="size"]');
    if (sizeSel) sizeSel.value = (run && run.size) ? run.size : (r.size || 'md');

    var boldOn = (run && run.bold) || r.bold;
    var italicOn = (run && run.italic) || r.italic;
    var underOn = (run && run.underline) || r.underline;

    var bBtn = bar.querySelector('[data-fmt="bold"]');
    if (bBtn) bBtn.classList.toggle('is-active', Boolean(boldOn));
    var iBtn = bar.querySelector('[data-fmt="italic"]');
    if (iBtn) iBtn.classList.toggle('is-active', Boolean(italicOn));
    var uBtn = bar.querySelector('[data-fmt="underline"]');
    if (uBtn) uBtn.classList.toggle('is-active', Boolean(underOn));

    var col = (run && run.color) || r.displayColor;
    var colorInput = bar.querySelector('[data-fmt="color"]');
    if (colorInput && /^#[0-9a-fA-F]{6}$/.test(col)) colorInput.value = col;
    var colorBar = bar.querySelector('[data-color-bar]');
    if (colorBar) colorBar.style.background = col;

    var alignBtns = bar.querySelectorAll('[data-fmt="align"]');
    var curAlign = r.align || 'left';
    for (var a = 0; a < alignBtns.length; a++) {
      alignBtns[a].classList.toggle('is-active', alignBtns[a].getAttribute('data-val') === curAlign);
    }
  }

  function handleFormatControl(controlEl, val) {
    var slotKey = controlEl.getAttribute('data-slot');
    var richKey = controlEl.getAttribute('data-target-rich') || '';
    var prop = controlEl.getAttribute('data-fmt');
    if (!slotKey || !prop || !S.model) return;

    if (richKey && prop !== 'align') {
      var saved = S.savedSelections[richKey];
      var ed = $('editor-body').querySelector('[data-rich-key="' + richKey + '"]');
      if (ed && saved && !saved.collapsed) {
        if (applySelectionFormatting(ed, saved, prop, val)) return;
      }
    }
    applyBoxFormatting(slotKey, richKey, prop, val);
  }

  // ---- Editing events ---------------------------------------------------

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var target = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }

  function onInput(e) {
    var t = e.target;
    if (!S.model) return;
    var richEditor = t.closest ? t.closest('[data-rich-key]') : null;
    if (richEditor) {
      syncEditorToModel(richEditor);
      captureSelection();
      updateDirtyNote();
      return;
    }
    if (t.hasAttribute('data-fmt')) {
      if (t.tagName === 'SELECT' || t.type === 'color') {
        handleFormatControl(t, t.value);
      }
      return;
    }
    if (t.hasAttribute('data-field')) {
      var value = t.type === 'checkbox' ? t.checked : t.value;
      setPath(S.model, t.getAttribute('data-field'), value);
    } else if (t.hasAttribute('data-list')) {
      var list = S.model[t.getAttribute('data-list')];
      var item = list[Number(t.getAttribute('data-i'))];
      if (item) item[t.getAttribute('data-key')] = t.value;
    } else {
      return;
    }
    updateDirtyNote();
  }

  function onKeydown(e) {
    var richEditor = e.target.closest ? e.target.closest('[data-rich-key]') : null;
    if (!richEditor) return;
    if (e.key === 'Enter' && richEditor.getAttribute('data-multiline') !== '1') {
      e.preventDefault();
    }
  }

  function onPaste(e) {
    var richEditor = e.target.closest ? e.target.closest('[data-rich-key]') : null;
    if (!richEditor || !e.clipboardData) return;
    e.preventDefault();
    var text = e.clipboardData.getData('text/plain') || '';
    if (richEditor.getAttribute('data-multiline') !== '1') {
      text = text.replace(/[\r\n]+/g, ' ');
    }
    if (typeof document.execCommand === 'function') {
      document.execCommand('insertText', false, text);
    } else {
      var sel = window.getSelection();
      if (sel && sel.rangeCount) {
        var r = sel.getRangeAt(0);
        r.deleteContents();
        r.insertNode(document.createTextNode(text));
        r.collapse(false);
      }
    }
    syncEditorToModel(richEditor);
    updateDirtyNote();
  }

  function onMousedown(e) {
    // Keep text selection active inside the rich box when clicking B / I / U / Align / Clear buttons.
    var fmtBtn = e.target.closest ? e.target.closest('button[data-fmt]') : null;
    if (fmtBtn) e.preventDefault();
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
    var fmtBtn = e.target.closest ? e.target.closest('button[data-fmt]') : null;
    if (fmtBtn) {
      handleFormatControl(fmtBtn, fmtBtn.getAttribute('data-val') || '');
      return;
    }
    var btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    var action = btn.getAttribute('data-action');
    if (action === 'cancel-upload') {
      if (S.abortUpload) S.abortUpload();
      return;
    }
    if (action === 'dismiss-upload') {
      var dismissSlot = btn.getAttribute('data-slot-id');
      if (dismissSlot && S.uploads[dismissSlot]) {
        delete S.uploads[dismissSlot];
        paintUploadSlot(dismissSlot);
      }
      return;
    }
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
    }
  }

  // ---- Uploads ----------------------------------------------------------

  var ALLOWED_IMAGE_EXT = { '.jpg': 1, '.jpeg': 1, '.png': 1, '.webp': 1, '.avif': 1, '.gif': 1 };
  var ALLOWED_VIDEO_EXT = { '.mp4': 1, '.webm': 1, '.m4v': 1, '.mov': 1 };
  var MIME_TO_EXT = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/x-m4v': '.m4v',
    'video/m4v': '.m4v',
    'video/quicktime': '.mov',
  };

  function extOfName(name) {
    var s = String(name || '');
    var dot = s.lastIndexOf('.');
    return dot >= 0 ? s.slice(dot).toLowerCase() : '';
  }

  function prepareUploadFile(file, expectVideo) {
    var rawName = String((file && file.name) || '').trim();
    var ext = extOfName(rawName);
    var mime = String((file && file.type) || '').split(';')[0].trim().toLowerCase();
    var uploadName = rawName || (expectVideo ? 'video' : 'photo');

    if (!ALLOWED_IMAGE_EXT[ext] && !ALLOWED_VIDEO_EXT[ext]) {
      var mapped = MIME_TO_EXT[mime] || '';
      if (mapped) {
        ext = mapped;
        uploadName = (rawName || (expectVideo ? 'video' : 'photo')) + mapped;
      }
    }

    if (!file || typeof file.size !== 'number' || file.size <= 0) {
      return {
        ok: false,
        displayName: uploadName,
        error: 'Could not read "' + uploadName + '" (0 bytes). Make sure it is downloaded on your phone and try again.',
      };
    }

    if (expectVideo) {
      if (!ALLOWED_VIDEO_EXT[ext]) {
        return {
          ok: false,
          displayName: uploadName,
          error: '"' + uploadName + '" is not a supported video format. Use MP4, MOV, WebM or M4V.',
        };
      }
      if (file.size > MAX_VIDEO) {
        return {
          ok: false,
          displayName: uploadName,
          error: '"' + uploadName + '" is ' + formatBytes(file.size) + ' — videos must be 95 MB or smaller.',
        };
      }
    } else {
      if (!ALLOWED_IMAGE_EXT[ext]) {
        return {
          ok: false,
          displayName: uploadName,
          error: '"' + uploadName + '" is not a supported image format. Use JPG, PNG, WebP, AVIF or GIF.',
        };
      }
      if (file.size > MAX_IMAGE) {
        return {
          ok: false,
          displayName: uploadName,
          error: '"' + uploadName + '" is ' + formatBytes(file.size) + ' — images must be 25 MB or smaller.',
        };
      }
    }

    return { ok: true, uploadName: uploadName, displayName: rawName || uploadName };
  }

  function imageSize(file) {
    if (typeof createImageBitmap !== 'function') return Promise.resolve(null);
    return createImageBitmap(file).then(function (bmp) {
      var size = { width: bmp.width, height: bmp.height };
      if (bmp.close) bmp.close();
      return size;
    }, function () { return null; });
  }

  function titleFrom(nameOrFile, fallback) {
    var name = typeof nameOrFile === 'string' ? nameOrFile : String((nameOrFile && nameOrFile.name) || '');
    var cleaned = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    return cleaned || fallback || 'Untitled';
  }

  function uploadFile(file, uploadName, hooks) {
    hooks = hooks || {};
    var form = new FormData();
    form.append('file', file, uploadName || file.name || 'upload');
    var url = API_BASE + profilePath(S.slug, '/media');

    if (typeof XMLHttpRequest !== 'function') {
      return api('POST', profilePath(S.slug, '/media'), { form: form });
    }

    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + S.token);

      if (hooks.registerAbort) {
        hooks.registerAbort(function () {
          try { xhr.abort(); } catch (_) {}
        });
      }

      if (xhr.upload) {
        xhr.upload.addEventListener('progress', function (e) {
          if (hooks.onProgress) {
            hooks.onProgress(e.loaded || 0, e.lengthComputable ? e.total : (file.size || 0), e.lengthComputable);
          }
        });
        xhr.upload.addEventListener('load', function () {
          if (hooks.onSent) hooks.onSent();
        });
      }

      xhr.addEventListener('load', function () {
        var data = {};
        try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
          return;
        }
        var contentType = (xhr.getResponseHeader && xhr.getResponseHeader('content-type')) || '';
        var fallback = xhr.status === 404 && contentType.indexOf('application/json') === -1
          ? 'Admin API not found at /api. Deploy on Cloudflare Pages or set apiBase in admin/config.js.'
          : (xhr.status === 413
            ? 'The file is too large for the server limit (95 MB maximum).'
            : 'The upload failed (' + xhr.status + ').');
        var err = new Error(data.error || fallback);
        err.status = xhr.status;
        reject(err);
      });

      xhr.addEventListener('error', function () {
        reject(new Error('Upload interrupted. Check your internet connection and try again.'));
      });

      xhr.addEventListener('abort', function () {
        var abortErr = new Error('Upload cancelled.');
        abortErr.aborted = true;
        reject(abortErr);
      });

      xhr.send(form);
    });
  }

  var uploadDoneTimers = {};
  function scheduleUploadAutoClear(slotId) {
    clearTimeout(uploadDoneTimers[slotId]);
    uploadDoneTimers[slotId] = setTimeout(function () {
      if (S.uploads[slotId] && S.uploads[slotId].state === 'done') {
        delete S.uploads[slotId];
        paintUploadSlot(slotId);
      }
    }, 5000);
  }

  function showUploadError(slotId, title, message) {
    clearTimeout(uploadDoneTimers[slotId]);
    S.uploads[slotId] = {
      state: 'error',
      title: title || 'Upload failed',
      detail: message,
      percent: 0,
      indeterminate: false,
      canCancel: false,
    };
    paintUploadSlot(slotId);
    setStatus(message, 'error');
    toast(message);
  }

  function onChange(e) {
    var input = e.target;
    if (input.hasAttribute('data-fmt') && (input.tagName === 'SELECT' || input.type === 'color')) {
      handleFormatControl(input, input.value);
      return;
    }
    var kind = input.getAttribute('data-upload');
    if (!kind || !input.files || !input.files.length) return;
    if (S.activeUploadSlot) {
      toast('Please wait for the current upload to finish.');
      return;
    }
    // Keep the File list alive until upload completes so mobile browsers do not
    // revoke temporary gallery file handles before FormData/XHR reads them.
    var files = Array.prototype.slice.call(input.files);
    var index = Number(input.getAttribute('data-i'));
    var doneReset = function () {
      try { input.value = ''; } catch (_) {}
    };

    if (kind === 'poster') {
      uploadPoster(files[0], index).then(doneReset, doneReset);
      return;
    }

    var cancelled = false;
    files.reduce(function (chain, file, idx) {
      return chain.then(function () {
        if (cancelled) return;
        return addMedia(kind, file, idx, files.length).then(function (res) {
          if (res && res.aborted) cancelled = true;
        });
      });
    }, Promise.resolve()).then(doneReset, doneReset);
  }

  function addMedia(kind, file, fileIndex, totalFiles) {
    var isVideo = kind === 'video';
    var slotId = kind;
    var prep = prepareUploadFile(file, isVideo);
    if (!prep.ok) {
      showUploadError(slotId, 'Cannot add ' + prep.displayName, prep.error);
      return Promise.resolve({ ok: false });
    }

    clearTimeout(uploadDoneTimers[slotId]);
    var batchPrefix = totalFiles > 1 ? ' (' + (fileIndex + 1) + ' of ' + totalFiles + ')' : '';
    var titleText = 'Uploading ' + (isVideo ? 'video' : (kind === 'cover' ? 'cover photo' : 'photo')) + batchPrefix + ': ' + prep.displayName;

    S.activeUploadSlot = slotId;
    S.uploads[slotId] = {
      state: 'uploading',
      title: titleText,
      detail: 'Preparing ' + formatBytes(file.size) + '…',
      percent: 0,
      indeterminate: true,
      canCancel: true,
    };
    setBusy(true, titleText + '…');
    paintUploadSlot(slotId);

    var hooks = {
      registerAbort: function (fn) { S.abortUpload = fn; },
      onProgress: function (loaded, total, computable) {
        if (!S.uploads[slotId] || S.uploads[slotId].state !== 'uploading') return;
        if (computable && total > 0) {
          var pct = Math.min(95, Math.max(1, Math.round((loaded / total) * 95)));
          S.uploads[slotId].percent = pct;
          S.uploads[slotId].indeterminate = false;
          S.uploads[slotId].detail = pct + '% · ' + formatBytes(loaded) + ' / ' + formatBytes(total);
        } else {
          S.uploads[slotId].indeterminate = true;
          S.uploads[slotId].detail = formatBytes(loaded) + ' sent…';
        }
        paintUploadSlot(slotId);
      },
      onSent: function () {
        if (!S.uploads[slotId] || S.uploads[slotId].state !== 'uploading') return;
        S.uploads[slotId].percent = 97;
        S.uploads[slotId].indeterminate = false;
        S.uploads[slotId].detail = '97% · Saving to cloud…';
        S.uploads[slotId].canCancel = false;
        paintUploadSlot(slotId);
      },
    };

    var fallbackTitle = isVideo ? 'Video ' + (S.model.videos.length + 1) : (kind === 'cover' ? 'Cover photo' : 'Photo ' + (S.model.photos.length + 1));

    return Promise.all([
      uploadFile(file, prep.uploadName, hooks),
      isVideo ? Promise.resolve(null) : imageSize(file),
    ]).then(function (results) {
      var uploaded = results[0];
      var size = results[1];
      if (kind === 'cover') {
        S.model.cover.push(withSize({ file: uploaded.url, alt: titleFrom(prep.uploadName, fallbackTitle) }, size));
      } else if (kind === 'photo') {
        S.model.photos.push(withSize({ file: uploaded.url, title: titleFrom(prep.uploadName, fallbackTitle), category: 'Portfolio', year: '', alt: '' }, size));
      } else if (kind === 'video') {
        S.model.videos.push({ file: uploaded.url, title: titleFrom(prep.uploadName, fallbackTitle), category: '', description: '' });
      }
      S.abortUpload = null;
      var isLast = !(totalFiles > 1 && fileIndex + 1 < totalFiles);
      if (isLast) {
        S.activeUploadSlot = '';
        S.uploads[slotId] = {
          state: 'done',
          title: (totalFiles > 1 ? 'Uploaded ' + totalFiles + ' files' : 'Uploaded ' + prep.displayName),
          detail: '100% · Save changes to publish',
          percent: 100,
          indeterminate: false,
          canCancel: false,
        };
        scheduleUploadAutoClear(slotId);
      }
      setStatus('Uploaded ' + prep.displayName + '. Save to publish it.', 'ok');
      render();
      paintSavebarProgress();
      return { ok: true };
    }).catch(function (err) {
      S.abortUpload = null;
      S.activeUploadSlot = '';
      if (err && err.aborted) {
        delete S.uploads[slotId];
        paintUploadSlot(slotId);
        setStatus('Upload cancelled.');
        toast('Upload cancelled');
        render();
        return { aborted: true };
      }
      showUploadError(slotId, 'Upload failed: ' + prep.displayName, (err && err.message) || 'Upload failed.');
      render();
      return { ok: false };
    }).then(function (outcome) {
      if (!S.activeUploadSlot) setBusy(false);
      return outcome;
    });
  }

  function uploadPoster(file, index) {
    var video = S.model.videos[index];
    if (!video) return Promise.resolve();
    var slotId = 'poster-' + index;
    var prep = prepareUploadFile(file, false);
    if (!prep.ok) {
      showUploadError(slotId, 'Cannot add poster', prep.error);
      return Promise.resolve();
    }

    clearTimeout(uploadDoneTimers[slotId]);
    S.activeUploadSlot = slotId;
    S.uploads[slotId] = {
      state: 'uploading',
      title: 'Uploading poster: ' + prep.displayName,
      detail: 'Preparing ' + formatBytes(file.size) + '…',
      percent: 0,
      indeterminate: true,
      canCancel: true,
    };
    setBusy(true, 'Uploading poster…');
    paintUploadSlot(slotId);

    var hooks = {
      registerAbort: function (fn) { S.abortUpload = fn; },
      onProgress: function (loaded, total, computable) {
        if (!S.uploads[slotId] || S.uploads[slotId].state !== 'uploading') return;
        if (computable && total > 0) {
          var pct = Math.min(95, Math.max(1, Math.round((loaded / total) * 95)));
          S.uploads[slotId].percent = pct;
          S.uploads[slotId].indeterminate = false;
          S.uploads[slotId].detail = pct + '% · ' + formatBytes(loaded) + ' / ' + formatBytes(total);
        } else {
          S.uploads[slotId].indeterminate = true;
          S.uploads[slotId].detail = formatBytes(loaded) + ' sent…';
        }
        paintUploadSlot(slotId);
      },
      onSent: function () {
        if (!S.uploads[slotId] || S.uploads[slotId].state !== 'uploading') return;
        S.uploads[slotId].percent = 97;
        S.uploads[slotId].indeterminate = false;
        S.uploads[slotId].detail = '97% · Saving to cloud…';
        S.uploads[slotId].canCancel = false;
        paintUploadSlot(slotId);
      },
    };

    return Promise.all([uploadFile(file, prep.uploadName, hooks), imageSize(file)]).then(function (results) {
      var uploaded = results[0];
      var size = results[1];
      if (video.poster && isHttp(video.poster) && S.pendingDeletes.indexOf(video.poster) === -1) {
        S.pendingDeletes.push(video.poster);
      }
      video.poster = uploaded.url;
      if (size) { video.posterWidth = size.width; video.posterHeight = size.height; }
      S.abortUpload = null;
      S.activeUploadSlot = '';
      S.uploads[slotId] = {
        state: 'done',
        title: 'Poster uploaded',
        detail: '100% · Save changes to publish',
        percent: 100,
        indeterminate: false,
        canCancel: false,
      };
      scheduleUploadAutoClear(slotId);
      setStatus('Poster uploaded. Save to publish it.', 'ok');
      render();
      paintSavebarProgress();
    }).catch(function (err) {
      S.abortUpload = null;
      S.activeUploadSlot = '';
      if (err && err.aborted) {
        delete S.uploads[slotId];
        paintUploadSlot(slotId);
        setStatus('Upload cancelled.');
        toast('Upload cancelled');
        render();
        return;
      }
      showUploadError(slotId, 'Poster upload failed', (err && err.message) || 'Poster upload failed.');
      render();
    }).then(function () {
      if (!S.activeUploadSlot) setBusy(false);
    });
  }

  function withSize(entry, size) {
    if (size) { entry.width = size.width; entry.height = size.height; }
    return entry;
  }

  function onMediaReady(e) {
    var t = e.target;
    if (!t || (t.tagName !== 'IMG' && t.tagName !== 'VIDEO')) return;
    var box = t.closest ? t.closest('.thumb-box') : null;
    if (!box) return;
    box.classList.remove('is-loading');
    box.classList.remove('is-error');
  }

  function onMediaError(e) {
    var t = e.target;
    if (!t || (t.tagName !== 'IMG' && t.tagName !== 'VIDEO')) return;
    var box = t.closest ? t.closest('.thumb-box') : null;
    if (!box) return;
    box.classList.remove('is-loading');
    box.classList.add('is-error');
    var st = box.querySelector('[data-thumb-status]');
    if (st) st.textContent = 'Preview unavailable';
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
  body.addEventListener('mousedown', onMousedown);
  body.addEventListener('keydown', onKeydown);
  body.addEventListener('paste', onPaste);
  body.addEventListener('keyup', captureSelection);
  body.addEventListener('mouseup', captureSelection);
  body.addEventListener('load', onMediaReady, true);
  body.addEventListener('loadedmetadata', onMediaReady, true);
  body.addEventListener('loadeddata', onMediaReady, true);
  body.addEventListener('error', onMediaError, true);
  document.addEventListener('selectionchange', captureSelection);

  window.addEventListener('beforeunload', function (e) {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  startAfterSignIn();
})();

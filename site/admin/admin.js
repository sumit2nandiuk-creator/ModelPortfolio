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
    archived: [],
    slug: '',
    isArchived: false,
    isNew: false,
    model: null,
    sha: null,
    saved: '',
    pendingDeletes: [],
    savedSelections: {}, // richKey -> { startPara, startOffset, endPara, endOffset, collapsed }
    uploads: {},         // slotId -> { state, title, detail, percent, indeterminate, canCancel }
    collapsedSections: {}, // sectionId -> true when collapsed in the editor
    collapsedGroups: {}, // groupId -> true when collapsed in the editor
    activeUploadSlot: '',
    abortUpload: null,
    groupSeq: 1,
    busy: false,
  };

  var $ = function (id) { return document.getElementById(id); };
  var LAST_PROFILE_KEY = 'admin.last-profile';

  function rememberedProfile() {
    try { return localStorage.getItem(LAST_PROFILE_KEY) || ''; } catch (_) { return ''; }
  }

  function rememberProfile(slug) {
    try {
      if (slug) localStorage.setItem(LAST_PROFILE_KEY, slug);
      else localStorage.removeItem(LAST_PROFILE_KEY);
    } catch (_) {}
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var ICONS = {
    add: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5h14v-5"/>',
    photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    external: '<path d="M14 4h6v6m0-6-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    logout: '<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
    save: '<path d="M5 3h12l4 4v14H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
    sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l1 2.5 2.5 1-2.5 1L19 22l-1-2.5-2.5-1 2.5-1 1-2.5z"/>',
    trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
    archive: '<path d="M3 4h18v5H3zM5 9v11h14V9M10 13h4"/>',
    restore: '<path d="M3 4h18v5H3zM5 9v11h14V9M12 13v5m0 0-2-2m2 2 2-2"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    left: '<path d="m14 6-6 6 6 6"/>',
    right: '<path d="m10 6 6 6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/>',
    x: '<path d="m18 6-12 12M6 6l12 12"/>',
  };

  function icon(name) {
    return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.add) + '</svg>';
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
      introVideo: null,
      contact: {},
    };
  }

  function nextGroupId() {
    S.groupSeq = (S.groupSeq || 0) + 1;
    return 'grp-' + S.groupSeq;
  }

  function buildEditorGroups(m) {
    var groups = [];
    var byLower = {};

    function ensureGroup(rawTitle) {
      var label = trimmed(rawTitle) || 'Portfolio';
      var key = label.toLowerCase();
      if (byLower[key]) return byLower[key];
      var grp = { id: nextGroupId(), title: label };
      byLower[key] = grp;
      groups.push(grp);
      return grp;
    }

    (Array.isArray(m.groups) ? m.groups : []).forEach(function (g) {
      if (typeof g === 'string' && trimmed(g)) ensureGroup(g);
    });

    (m.videos || []).forEach(function (v) {
      if (!v) return;
      var g = ensureGroup(trimmed(v.category) || trimmed(v.title) || 'Portfolio');
      v._gid = g.id;
      v.category = g.title;
    });

    (m.photos || []).forEach(function (p) {
      if (!p) return;
      var g = ensureGroup(trimmed(p.category) || trimmed(p.title) || 'Portfolio');
      p._gid = g.id;
      p.category = g.title;
    });

    if (!groups.length) {
      groups.push({ id: nextGroupId(), title: 'Portfolio' });
    }
    m._groups = groups;
  }

  function normalise(model) {
    var m = JSON.parse(JSON.stringify(model));
    m.cover = Array.isArray(m.cover) ? m.cover : (m.cover ? [m.cover] : []);
    m.photos = Array.isArray(m.photos) ? m.photos : [];
    m.videos = Array.isArray(m.videos) ? m.videos : [];
    m.bio = Array.isArray(m.bio) ? m.bio : [];
    m.stats = Array.isArray(m.stats) ? m.stats : [];
    m.introVideo = (m.introVideo && typeof m.introVideo === 'object' && !Array.isArray(m.introVideo) && m.introVideo.file)
      ? m.introVideo
      : null;
    m.contact = m.contact || {};
    m.fonts = (m.fonts && typeof m.fonts === 'object' && !Array.isArray(m.fonts)) ? m.fonts : {};
    m.texts = (m.texts && typeof m.texts === 'object' && !Array.isArray(m.texts)) ? m.texts : {};
    m.richText = (m.richText && typeof m.richText === 'object' && !Array.isArray(m.richText)) ? m.richText : {};

    // Pre-populate the default italicised word in Contact heading when untouched.
    if (!m.richText.contactHeading && !m.texts.contactHeading) {
      m.richText.contactHeading = cloneRuns(DEFAULT_CONTACT_HEADING_RUNS);
    }
    buildEditorGroups(m);
    return m;
  }

  function cleanEntry(entry, keys) {
    var out = {};
    Object.keys(entry).forEach(function (k) {
      if (k.charAt(0) !== '_') out[k] = entry[k];
    });
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
    Object.keys(m).forEach(function (k) {
      if (k.charAt(0) !== '_') out[k] = m[k];
    });
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

    var editorGroups = Array.isArray(m._groups) && m._groups.length
      ? m._groups
      : [{ id: 'default', title: 'Portfolio' }];
    var groupById = {};
    var cleanGroupTitles = [];
    var seenGroupLower = {};
    editorGroups.forEach(function (g, idx) {
      var title = trimmed(g.title) || ('Group ' + (idx + 1));
      groupById[g.id] = title;
      var lower = title.toLowerCase();
      if (!seenGroupLower[lower]) {
        seenGroupLower[lower] = true;
        cleanGroupTitles.push(title);
      }
    });
    var fallbackGroup = cleanGroupTitles[0] || 'Portfolio';

    var orderedVideos = [];
    var orderedPhotos = [];
    editorGroups.forEach(function (g) {
      var gTitle = groupById[g.id] || fallbackGroup;
      (m.videos || []).forEach(function (v) {
        if (v && v._gid === g.id) {
          var vCopy = Object.assign({}, v, {
            category: gTitle,
            title: trimmed(v.title) || gTitle,
          });
          orderedVideos.push(cleanEntry(vCopy, ['file', 'width', 'height', 'poster', 'posterWidth', 'posterHeight', 'title', 'category', 'description']));
        }
      });
      (m.photos || []).forEach(function (p) {
        if (p && p._gid === g.id) {
          var pCopy = Object.assign({}, p, {
            category: gTitle,
            title: trimmed(p.title) || gTitle,
          });
          orderedPhotos.push(cleanEntry(pCopy, ['file', 'title', 'category', 'year', 'alt', 'width', 'height']));
        }
      });
    });
    // Include any item whose _gid was missing or unmatched.
    (m.videos || []).forEach(function (v) {
      if (v && (!v._gid || !groupById[v._gid])) {
        var gTitle = trimmed(v.category) || trimmed(v.title) || fallbackGroup;
        var vCopy = Object.assign({}, v, { category: gTitle, title: trimmed(v.title) || gTitle });
        orderedVideos.push(cleanEntry(vCopy, ['file', 'width', 'height', 'poster', 'posterWidth', 'posterHeight', 'title', 'category', 'description']));
      }
    });
    (m.photos || []).forEach(function (p) {
      if (p && (!p._gid || !groupById[p._gid])) {
        var gTitle = trimmed(p.category) || trimmed(p.title) || fallbackGroup;
        var pCopy = Object.assign({}, p, { category: gTitle, title: trimmed(p.title) || gTitle });
        orderedPhotos.push(cleanEntry(pCopy, ['file', 'title', 'category', 'year', 'alt', 'width', 'height']));
      }
    });

    out.photos = orderedPhotos;
    out.videos = orderedVideos;
    var keepGroups = cleanGroupTitles.length > 1 ||
      (cleanGroupTitles.length === 1 && (cleanGroupTitles[0] !== 'Portfolio' || orderedPhotos.length > 0 || orderedVideos.length > 0));
    setOrDelete(out, 'groups', keepGroups ? cleanGroupTitles : null);

    var contact = cleanEntry(m.contact || {}, Object.keys(m.contact || {}));
    setOrDelete(out, 'contact', Object.keys(contact).length ? contact : null);

    // Optional introduction video shown at the end of the About section.
    if (m.introVideo && typeof m.introVideo === 'object' && m.introVideo.file) {
      var introClean = cleanEntry(m.introVideo, ['file', 'title', 'poster', 'width', 'height', 'posterWidth', 'posterHeight']);
      setOrDelete(out, 'introVideo', Object.keys(introClean).length ? introClean : null);
    } else {
      delete out.introVideo;
    }

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
    var singleKeys = ['name', 'aboutLabel', 'portfolioLabel', 'videosLabel', 'videosHeading', 'contactLabel', 'contactHeading'];

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
  // Save-feedback icons: green tick for success, red cross for failure.
  var TOAST_ICONS = { ok: '✓', error: '✕' };

  function hideToast() {
    var el = $('toast');
    if (!el) return;
    clearTimeout(toastTimer);
    toastTimer = null;
    el.hidden = true;
  }

  // Shows a transient popup. Pass kind = 'ok' for a green tick or 'error' for a
  // red cross so save feedback is unambiguous. Without a kind it stays a plain
  // message (used for upload / profile notices).
  function toast(text, kind) {
    var el = $('toast');
    if (!el) return;
    var icon = kind ? TOAST_ICONS[kind] || '' : '';
    var body = (icon
      ? '<span class="toast-icon" role="img" aria-label="' + (kind === 'ok' ? 'Success' : 'Error') + '">' + icon + '</span>'
      : '') + '<span class="toast-text">' + esc(text) + '</span>';
    el.innerHTML = body;
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    if (kind === 'error') el.setAttribute('role', 'alert');
    else el.setAttribute('role', 'status');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function setBusy(on, label) {
    S.busy = on;
    $('save').disabled = on;
    updateProfileActions();
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
    if ($('brand-picker')) $('brand-picker').hidden = name !== 'editor';
  }

  function configured() {
    return API_BASE.indexOf('example.workers.dev') === -1;
  }

  function signIn(token) {
    S.token = token;
    sessionStorage.setItem('admin.token', token);
    return api('GET', '/api/models').then(function (data) {
      S.models = data.models || [];
      S.archived = data.archived || [];
      showScreen('editor');
      renderPicker();
      if (S.models.length) {
        var wanted = rememberedProfile();
        return openProfile(S.models.indexOf(wanted) !== -1 ? wanted : S.models[0]);
      }
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
    S.isArchived = false;
    S.uploads = {};
    S.collapsedSections = {};
    S.collapsedGroups = {};
    S.activeUploadSlot = '';
    paintSavebarProgress();
    showScreen('login');
  }

  function updateProfileActions() {
    var archiveBtn = $('archive-profile');
    var deleteBtn = $('delete-profile');
    var viewBtn = $('view-site');
    var disabled = !S.slug || S.isNew || S.busy;
    var variantBtn = $('variant-notice-generate');
    if (variantBtn) variantBtn.disabled = Boolean(S.busy);
    if (archiveBtn) {
      var label = S.isArchived ? 'Restore profile' : 'Temporarily hide profile';
      archiveBtn.disabled = disabled;
      archiveBtn.setAttribute('aria-label', label);
      archiveBtn.setAttribute('title', label);
      archiveBtn.innerHTML = icon(S.isArchived ? 'restore' : 'archive');
    }
    if (deleteBtn) deleteBtn.disabled = disabled;
    if (viewBtn) {
      var unavailable = !S.slug || S.isArchived;
      viewBtn.href = unavailable ? '#' : '../' + encodeURIComponent(S.slug) + '/';
      viewBtn.setAttribute('aria-disabled', String(unavailable));
      viewBtn.classList.toggle('is-disabled', unavailable);
      viewBtn.title = S.isArchived ? 'Archived profile is hidden from the public site' : 'View site';
    }
  }

  function renderPicker() {
    var list = S.models.slice();
    if (S.isNew && S.slug && list.indexOf(S.slug) === -1) list.push(S.slug);
    $('model-picker').innerHTML = list.map(function (slug) {
      var label = slug + (S.archived.indexOf(slug) !== -1 ? ' · Archived' : '');
      return '<option value="' + esc(slug) + '"' + (slug === S.slug ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    updateProfileActions();
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
      S.isArchived = S.archived.indexOf(slug) !== -1;
      rememberProfile(slug);
      S.sha = data.sha;
      S.model = normalise(data.model);
      S.saved = snapshot();
      S.pendingDeletes = [];
      S.savedSelections = {};
      S.uploads = {};
      S.collapsedSections = {};
      S.collapsedGroups = {};
      S.activeUploadSlot = '';
      paintSavebarProgress();
      renderPicker();
      setStatus(S.isArchived ? 'Archived profile · hidden from the public site' : '');
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
    S.isArchived = false;
    S.sha = null;
    S.model = normalise(blankProfile(slug, name));
    S.saved = '';
    S.pendingDeletes = [];
    S.savedSelections = {};
    S.uploads = {};
    S.collapsedSections = {};
    S.collapsedGroups = {};
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
    var customVal = m.texts && m.texts[richKey];
    if (richKey === 'portfolioHeading' && customVal && /^categories$/i.test(trimmed(customVal))) {
      customVal = '';
    }
    var plain = richKey === 'name'
      ? (m.name || '')
      : (customVal !== undefined ? customVal : (DEFAULT_TEXTS[richKey] || ''));
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
      actionBtn = '<button type="button" class="btn icon-btn ghost" data-action="cancel-upload" data-slot-id="' + esc(slotId) + '" title="Cancel upload" aria-label="Cancel upload">' + icon('x') + '</button>';
    } else if (info.state === 'error' || info.state === 'done') {
      actionBtn = '<button type="button" class="btn icon-btn ghost" data-action="dismiss-upload" data-slot-id="' + esc(slotId) + '" title="Dismiss" aria-label="Dismiss">' + icon('x') + '</button>';
    }
    var track = info.state === 'error'
      ? ''
      : '<div class="upload-track' + (info.indeterminate ? ' is-indeterminate' : '') + '" role="progressbar"' +
          ' aria-valuemin="0" aria-valuemax="100" aria-valuetext="' + esc(info.detail || info.title || 'Uploading') + '"' +
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
        ' aria-valuemin="0" aria-valuemax="100" aria-valuetext="' + esc(active.detail || active.title || 'Uploading') + '"' +
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

  var SECTION_IDS = ['profile', 'intro', 'measurements', 'contact', 'cover', 'portfolio'];
  var SECTION_LABELS = {
    profile: 'Profile & About',
    intro: 'Introduction video',
    measurements: 'Measurements',
    contact: 'Contact',
    cover: 'Cover photos',
    portfolio: 'Portfolio',
  };

  function areAllSectionsCollapsed() {
    return SECTION_IDS.every(function (id) { return Boolean(S.collapsedSections[id]); });
  }

  function syncSectionCollapseDom(sectionId) {
    var root = $('editor-body');
    if (!root) return;
    var collapsed = Boolean(S.collapsedSections[sectionId]);
    var card = root.querySelector('[data-section-card="' + sectionId + '"]');
    if (card) {
      card.classList.toggle('is-collapsed', collapsed);
      var bodyEl = card.querySelector('.section-card-body');
      if (bodyEl) bodyEl.hidden = collapsed;
      var toggleBtns = card.querySelectorAll('[data-action="toggle-section"]');
      for (var b = 0; b < toggleBtns.length; b++) {
        var label = (collapsed ? 'Expand ' : 'Collapse ') + (SECTION_LABELS[sectionId] || sectionId) + ' section';
        toggleBtns[b].setAttribute('aria-expanded', String(!collapsed));
        toggleBtns[b].setAttribute('aria-label', label);
        toggleBtns[b].setAttribute('title', label);
      }
      var chev = card.querySelector('.section-chevron');
      if (chev) chev.innerHTML = icon(collapsed ? 'chevronRight' : 'chevronDown');
    }
    var toggleAllBtn = root.querySelector('[data-action="toggle-all-sections"]');
    if (toggleAllBtn) {
      var expandAll = areAllSectionsCollapsed();
      var allLabel = expandAll ? 'Expand all sections' : 'Collapse all sections';
      toggleAllBtn.setAttribute('aria-label', allLabel);
      toggleAllBtn.setAttribute('title', allLabel);
      toggleAllBtn.innerHTML = icon(expandAll ? 'expand' : 'chevronDown');
    }
  }

  function sectionCard(sectionId, title, actionsHtml, bodyHtml, uploadSlotId) {
    var isCollapsed = Boolean(S.collapsedSections[sectionId]);
    var bodyId = 'section-body-' + sectionId;
    var toggleLabel = (isCollapsed ? 'Expand ' : 'Collapse ') + (SECTION_LABELS[sectionId] || sectionId) + ' section';
    return '<section class="card section-card' + (isCollapsed ? ' is-collapsed' : '') + '" data-section-card="' + esc(sectionId) + '">' +
      '<div class="toolbar section-card-head">' +
        '<div class="section-title-wrap">' +
          '<button type="button" class="btn icon-btn ghost section-collapse-btn" data-action="toggle-section" data-section-id="' + esc(sectionId) + '" aria-label="' + esc(toggleLabel) + '" aria-expanded="' + String(!isCollapsed) + '" aria-controls="' + esc(bodyId) + '" title="' + esc(toggleLabel) + '">' +
            '<span class="section-chevron" aria-hidden="true">' + icon(isCollapsed ? 'chevronRight' : 'chevronDown') + '</span>' +
          '</button>' +
          '<h2><button type="button" class="section-heading-btn" data-action="toggle-section" data-section-id="' + esc(sectionId) + '" aria-label="' + esc(toggleLabel) + '" aria-expanded="' + String(!isCollapsed) + '" aria-controls="' + esc(bodyId) + '">' + esc(title) + '</button></h2>' +
        '</div>' +
        (actionsHtml ? '<div class="toolbar-actions">' + actionsHtml + '</div>' : '') +
      '</div>' +
      (uploadSlotId ? uploadSlotHtml(uploadSlotId) : '') +
      '<div id="' + esc(bodyId) + '" class="section-card-body"' + (isCollapsed ? ' hidden' : '') + '>' +
        '<div class="section-card-body-inner">' + bodyHtml + '</div>' +
      '</div>' +
    '</section>';
  }

  function moveButtons(list, i, count) {
    return '<button type="button" class="btn icon-btn" data-action="move" data-list="' + list + '" data-i="' + i + '" data-dir="-1"' +
      (i === 0 ? ' disabled' : '') + ' title="Move up" aria-label="Move up">' + icon('up') + '</button>' +
      '<button type="button" class="btn icon-btn" data-action="move" data-list="' + list + '" data-i="' + i + '" data-dir="1"' +
      (i === count - 1 ? ' disabled' : '') + ' title="Move down" aria-label="Move down">' + icon('down') + '</button>';
  }

  function removeButton(list, i) {
    return '<button type="button" class="btn icon-btn danger" data-action="remove" data-list="' + list + '" data-i="' + i + '" title="Remove" aria-label="Remove">' + icon('trash') + '</button>';
  }

  function uploadButton(label, kind, extra) {
    var uploading = Boolean(S.activeUploadSlot);
    var glyph = (kind === 'video' || kind === 'intro') ? 'video' : 'photo';
    return '<label class="btn icon-btn file-btn' + (uploading ? ' is-uploading' : '') + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + icon(glyph) +
      '<input type="file" aria-label="' + esc(label) + '" data-upload="' + kind + '"' + (uploading ? ' disabled' : '') + (extra || '') + '></label>';
  }

  function coverHtml() {
    return S.model.cover.map(function (c, i) {
      return '<div class="item">' +
        thumbBoxHtml('<img class="thumb" alt="" src="' + esc(mediaSrc(c.thumbnail || c.file)) + '" loading="lazy">', 'Loading photo…') +
        '<div><div class="item-fields">' +
        '<label class="full">Alt text (describe the photo for screen readers)' +
        '<input data-list="cover" data-i="' + i + '" data-key="alt" value="' + esc(c.alt) + '"></label>' +
        '</div><div class="item-actions">' + moveButtons('cover', i, S.model.cover.length) + removeButton('cover', i) +
        '</div></div></div>';
    }).join('') || '<p class="muted">No cover photos yet. The first one is shown first on the site.</p>';
  }

  function groupSelectOptionsHtml(groups, activeGroupId) {
    return groups.map(function (g, idx) {
      var label = trimmed(g.title) || ('Group ' + (idx + 1));
      return '<option value="' + esc(g.id) + '"' + (g.id === activeGroupId ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  function groupMoveItemButtons(list, globalIndex, posInGroup, countInGroup) {
    return '<button type="button" class="btn icon-btn" data-action="move-in-group" data-list="' + list + '" data-i="' + globalIndex + '" data-dir="-1"' +
      (posInGroup === 0 ? ' disabled' : '') + ' title="Move left" aria-label="Move left">' + icon('left') + '</button>' +
      '<button type="button" class="btn icon-btn" data-action="move-in-group" data-list="' + list + '" data-i="' + globalIndex + '" data-dir="1"' +
      (posInGroup === countInGroup - 1 ? ' disabled' : '') + ' title="Move right" aria-label="Move right">' + icon('right') + '</button>';
  }

  function groupSummaryText(vCount, pCount) {
    var parts = [];
    parts.push(vCount + (vCount === 1 ? ' video' : ' videos'));
    parts.push(pCount + (pCount === 1 ? ' photo' : ' photos'));
    return parts.join(' · ');
  }

  function areAllGroupsCollapsed() {
    var groups = (S.model && S.model._groups) || [];
    if (!groups.length) return false;
    return groups.every(function (g) { return Boolean(S.collapsedGroups[g.id]); });
  }

  function syncGroupCollapseDom(groupId) {
    var root = $('editor-body');
    if (!root) return;
    var collapsed = Boolean(S.collapsedGroups[groupId]);
    var card = root.querySelector('[data-group-card="' + groupId + '"]');
    if (card) {
      card.classList.toggle('is-collapsed', collapsed);
      var bodyEl = card.querySelector('.group-card-body');
      if (bodyEl) bodyEl.hidden = collapsed;
      var toggleBtns = card.querySelectorAll('[data-action="toggle-group"]');
      for (var b = 0; b < toggleBtns.length; b++) {
        var label = (collapsed ? 'Expand ' : 'Collapse ') + 'category';
        toggleBtns[b].setAttribute('aria-expanded', String(!collapsed));
        toggleBtns[b].setAttribute('aria-label', label);
        toggleBtns[b].setAttribute('title', label);
      }
      var chev = card.querySelector('.group-chevron');
      if (chev) chev.innerHTML = icon(collapsed ? 'chevronRight' : 'chevronDown');
    }
    var toggleAllBtn = root.querySelector('[data-action="toggle-all-groups"]');
    if (toggleAllBtn) {
      var expandAll = areAllGroupsCollapsed();
      var allLabel = expandAll ? 'Expand all categories' : 'Collapse all categories';
      toggleAllBtn.setAttribute('aria-label', allLabel);
      toggleAllBtn.setAttribute('title', allLabel);
      toggleAllBtn.innerHTML = icon(expandAll ? 'expand' : 'chevronDown');
    }
  }

  function portfolioGroupsHtml() {
    var m = S.model;
    var groups = Array.isArray(m._groups) && m._groups.length ? m._groups : [{ id: 'default', title: 'Portfolio' }];
    var videoStyle = esc(boxInlineCss('videoText'));
    var captionStyle = esc(boxInlineCss('captions'));
    var aboutLabelStyle = esc(boxInlineCss('aboutLabel'));

    return groups.map(function (grp, gIdx) {
      var isCollapsed = Boolean(S.collapsedGroups[grp.id]);
      var groupVideos = [];
      (m.videos || []).forEach(function (v, vIdx) {
        if (v && v._gid === grp.id) groupVideos.push({ entry: v, index: vIdx });
      });
      var groupPhotos = [];
      (m.photos || []).forEach(function (p, pIdx) {
        if (p && p._gid === grp.id) groupPhotos.push({ entry: p, index: pIdx });
      });

      var totalItems = groupVideos.length + groupPhotos.length;
      var groupTitleVal = grp.title == null ? '' : grp.title;
      var knownGroupDims = [];
      groupVideos.forEach(function (ref) {
        var v = ref.entry;
        if (v.width && v.height) knownGroupDims.push({ w: v.width, h: v.height });
        else if (v.posterWidth && v.posterHeight) knownGroupDims.push({ w: v.posterWidth, h: v.posterHeight });
      });
      groupPhotos.forEach(function (ref) {
        var p = ref.entry;
        if (p.width && p.height) knownGroupDims.push({ w: p.width, h: p.height });
      });
      var isAllLandscapeGroup = totalItems > 0 &&
        knownGroupDims.length === totalItems &&
        knownGroupDims.every(function (d) { return d.w > d.h; });

      var videoCardsHtml = groupVideos.map(function (ref, vPos) {
        var v = ref.entry;
        var i = ref.index;
        var isPortrait = (v.width && v.height && v.height > v.width) ||
          (!v.width && v.posterWidth && v.posterHeight && v.posterHeight > v.posterWidth);
        var ratioCls = isPortrait ? 'portrait' : 'wide';
        var naturalVideoAttr = (v.width && v.height) ? ' data-natural-w="' + v.width + '" data-natural-h="' + v.height + '"' : '';
        var preview = v.poster
          ? thumbBoxHtml('<img class="thumb ' + ratioCls + '"' + naturalVideoAttr + ' alt="" src="' + esc(mediaSrc(v.poster)) + '" loading="lazy">', 'Loading poster…')
          : (v.file
            ? thumbBoxHtml('<video class="thumb ' + ratioCls + '"' + naturalVideoAttr + ' data-video-index="' + i + '" preload="auto" muted playsinline src="' + esc(mediaSrc(v.file)) + '#t=0.1"></video>', 'Loading video…')
            : '<div class="thumb-box"><div class="thumb wide" aria-hidden="true"></div></div>');
        return '<div class="item video admin-media-card">' +
          preview +
          '<div class="admin-media-body">' +
            '<div class="admin-media-badge-row">' +
              '<span class="media-kind-badge is-video">#' + (vPos + 1) + ' · Video</span>' +
            '</div>' +
            '<div class="item-fields">' +
              '<label>Subtitle / Title<input data-list="videos" data-i="' + i + '" data-key="title" data-styled-slot="videoText" style="' + videoStyle + '" value="' + esc(v.title) + '" placeholder="Optional video title"></label>' +
              '<label>Group<select data-move-item-group="videos" data-i="' + i + '">' + groupSelectOptionsHtml(groups, grp.id) + '</select></label>' +
              '<label class="full">Description<input data-list="videos" data-i="' + i + '" data-key="description" data-styled-slot="videoText" style="' + videoStyle + '" value="' + esc(v.description) + '" placeholder="Optional caption"></label>' +
            '</div>' +
            uploadSlotHtml('poster-' + i) +
            '<div class="item-actions">' +
              uploadButton(v.poster ? 'Replace poster' : 'Add poster', 'poster', ' accept="image/*" data-i="' + i + '"') +
              groupMoveItemButtons('videos', i, vPos, groupVideos.length) +
              removeButton('videos', i) +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      var photoCardsHtml = groupPhotos.map(function (ref, pPos) {
        var p = ref.entry;
        var i = ref.index;
        var seqNum = groupVideos.length + pPos + 1;
        var naturalPhotoAttr = (p.width && p.height) ? ' data-natural-w="' + p.width + '" data-natural-h="' + p.height + '"' : '';
        return '<div class="item photo admin-media-card">' +
          thumbBoxHtml('<img class="thumb"' + naturalPhotoAttr + ' alt="" src="' + esc(mediaSrc(p.thumbnail || p.file)) + '" loading="lazy">', 'Loading photo…') +
          '<div class="admin-media-body">' +
            '<div class="admin-media-badge-row">' +
              '<span class="media-kind-badge is-photo">#' + seqNum + ' · Photo</span>' +
            '</div>' +
            '<div class="item-fields">' +
              '<label>Photo title<input data-list="photos" data-i="' + i + '" data-key="title" value="' + esc(p.title) + '"></label>' +
              '<label>Group<select data-move-item-group="photos" data-i="' + i + '">' + groupSelectOptionsHtml(groups, grp.id) + '</select></label>' +
              '<label>Year<input data-list="photos" data-i="' + i + '" data-key="year" data-styled-slot="captions" style="' + captionStyle + '" value="' + esc(p.year) + '" placeholder="Optional"></label>' +
              '<label>Alt text<input data-list="photos" data-i="' + i + '" data-key="alt" value="' + esc(p.alt) + '" placeholder="Describe photo"></label>' +
            '</div>' +
            '<div class="item-actions">' +
              groupMoveItemButtons('photos', i, pPos, groupPhotos.length) +
              removeButton('photos', i) +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      var rowBody = totalItems > 0
        ? '<div class="admin-media-row' + (totalItems < 2 ? ' is-single' : '') + '">' + videoCardsHtml + photoCardsHtml + '</div>'
        : '<p class="muted group-empty">Empty category</p>';

      return '<div class="group-card' + (isCollapsed ? ' is-collapsed' : '') + (isAllLandscapeGroup ? ' is-landscape-group' : '') + '" data-group-card="' + esc(grp.id) + '"' + (groupPhotos.length > 0 ? ' data-has-photos="1"' : '') + (isAllLandscapeGroup ? ' data-landscape-group="1"' : '') + '>' +
        '<div class="group-card-head">' +
          '<div class="group-title-wrap">' +
            '<button type="button" class="btn icon-btn ghost group-collapse-btn" data-action="toggle-group" data-group-id="' + esc(grp.id) + '" aria-label="' + (isCollapsed ? 'Expand' : 'Collapse') + ' category" aria-expanded="' + String(!isCollapsed) + '" aria-controls="group-body-' + esc(grp.id) + '" title="' + (isCollapsed ? 'Expand' : 'Collapse') + ' category">' +
              '<span class="group-chevron" aria-hidden="true">' + icon(isCollapsed ? 'chevronRight' : 'chevronDown') + '</span>' +
            '</button>' +
            '<label class="group-title-label">Category' +
              '<input class="group-title-input" data-group-title="' + gIdx + '" data-styled-slot="aboutLabel" style="' + aboutLabelStyle + '" value="' + esc(groupTitleVal) + '" placeholder="e.g. Bridal, Editorial, Traditional">' +
            '</label>' +
            '<button type="button" class="group-count-pill" data-action="toggle-group" data-group-id="' + esc(grp.id) + '" aria-label="Toggle category items" aria-expanded="' + String(!isCollapsed) + '" data-group-counts="' + gIdx + '">' + esc(groupSummaryText(groupVideos.length, groupPhotos.length)) + '</button>' +
          '</div>' +
          '<div class="group-head-actions">' +
            uploadButton('Add video', 'video', ' accept="video/*" multiple data-group-id="' + esc(grp.id) + '"') +
            uploadButton('Add photo', 'photo', ' accept="image/*" multiple data-group-id="' + esc(grp.id) + '"') +
            '<button type="button" class="btn icon-btn" data-action="move-group" data-group-index="' + gIdx + '" data-dir="-1"' + (gIdx === 0 ? ' disabled' : '') + ' title="Move category up" aria-label="Move category up">' + icon('up') + '</button>' +
            '<button type="button" class="btn icon-btn" data-action="move-group" data-group-index="' + gIdx + '" data-dir="1"' + (gIdx === groups.length - 1 ? ' disabled' : '') + ' title="Move category down" aria-label="Move category down">' + icon('down') + '</button>' +
            '<button type="button" class="btn icon-btn danger" data-action="remove-group" data-group-index="' + gIdx + '" title="Remove category" aria-label="Remove category">' + icon('trash') + '</button>' +
          '</div>' +
        '</div>' +
        uploadSlotHtml('group-' + grp.id) +
        '<div id="group-body-' + esc(grp.id) + '" class="group-card-body"' + (isCollapsed ? ' hidden' : '') + '>' +
          '<div class="group-card-body-inner">' + rowBody + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // The single introduction video card. It lives in its own editor section and
  // is shown in a frame at the end of the About section on the site.
  function introVideoHtml() {
    var intro = S.model.introVideo;
    var videoStyle = esc(boxInlineCss('videoText'));
    if (!intro || !intro.file) {
      return '<p class="muted">No introduction video yet. Add one and it appears in a frame at the end of the About section. A landscape video fits the frame best.</p>';
    }
    var preview = intro.poster
      ? thumbBoxHtml('<img class="thumb wide" alt="" src="' + esc(mediaSrc(intro.posterThumbnail || intro.poster)) + '" loading="lazy">', 'Loading poster…')
      : thumbBoxHtml('<video class="thumb wide" preload="auto" muted playsinline src="' + esc(mediaSrc(intro.file)) + '#t=0.1"></video>', 'Loading video…');
    return '<div class="item video admin-media-card">' +
      preview +
      '<div class="admin-media-body">' +
        '<div class="admin-media-badge-row">' +
          '<span class="media-kind-badge is-video">About · Introduction video</span>' +
        '</div>' +
        '<div class="item-fields">' +
          '<label class="full">Caption / Title<input data-field="introVideo.title" data-styled-slot="videoText" style="' + videoStyle + '" value="' + esc(intro.title || '') + '" placeholder="Optional caption"></label>' +
        '</div>' +
        uploadSlotHtml('intro-poster') +
        '<div class="item-actions">' +
          uploadButton(intro.poster ? 'Replace poster' : 'Add poster', 'intro-poster', ' accept="image/*"') +
          '<button type="button" class="btn icon-btn danger" data-action="remove-intro" title="Remove introduction video" aria-label="Remove introduction video">' + icon('trash') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function statsHtml() {
    var count = S.model.stats.length;
    if (!count) return '<p class="muted">No measurements yet.</p>';
    var statStyle = esc(boxInlineCss('stats'));
    var labelStyle = esc(boxInlineCss('aboutLabel'));
    var head = '<div class="stats-head-row" aria-hidden="true">' +
      '<span class="stats-head-label">Label</span><span>Value</span><span>Order</span>' +
    '</div>';
    var rows = S.model.stats.map(function (s, i) {
      return '<div class="stat-row">' +
        '<input aria-label="Measurement label" placeholder="Label (e.g. Height)" data-list="stats" data-i="' + i + '" data-key="label" data-styled-slot="aboutLabel" style="' + labelStyle + '" value="' + esc(s.label) + '">' +
        '<input aria-label="Measurement value" placeholder="Value (e.g. 5′4″)" data-list="stats" data-i="' + i + '" data-key="value" data-styled-slot="stats" style="' + statStyle + '" value="' + esc(s.value) + '">' +
        '<div class="stat-row-actions">' +
          '<button type="button" class="btn icon-btn stat-icon-btn" data-action="move" data-list="stats" data-i="' + i + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' title="Move up" aria-label="Move measurement up">' + icon('up') + '</button>' +
          '<button type="button" class="btn icon-btn stat-icon-btn" data-action="move" data-list="stats" data-i="' + i + '" data-dir="1"' + (i === count - 1 ? ' disabled' : '') + ' title="Move down" aria-label="Move measurement down">' + icon('down') + '</button>' +
          '<button type="button" class="btn icon-btn danger stat-icon-btn" data-action="remove" data-list="stats" data-i="' + i + '" title="Remove measurement" aria-label="Remove measurement">' + icon('trash') + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="stats-editor-list">' + head + rows + '</div>';
  }

  function render() {
    ensurePreviewFonts();
    var m = S.model;
    var contact = m.contact || {};
    var seo = m.seo || {};
    $('editor-body').innerHTML = [
      variantNoticeHtml(),

      '<div class="sections-overview-bar">' +
        '<button type="button" class="btn icon-btn ghost" data-action="toggle-all-sections" aria-label="' + (areAllSectionsCollapsed() ? 'Expand all sections' : 'Collapse all sections') + '" title="' + (areAllSectionsCollapsed() ? 'Expand all sections' : 'Collapse all sections') + '">' + icon(areAllSectionsCollapsed() ? 'expand' : 'chevronDown') + '</button>' +
      '</div>',

      sectionCard(
        'profile',
        'Profile & About',
        '',
        '<div class="stack">' +
          composerBoxHtml({
            richKey: 'name',
            slot: 'name',
            label: 'Name',
            hint: 'Shown in the top header; select words or use the bar to style the box',
            multiline: false,
            editorClass: 'composer-editor--name',
            baseRem: 1.55,
            placeholder: 'Model name',
          }) +
          composerBoxHtml({
            richKey: 'aboutLabel',
            slot: 'aboutLabel',
            label: 'About section label',
            multiline: false,
            alignable: true,
            editorClass: 'composer-editor--label',
            baseRem: 0.82,
            placeholder: DEFAULT_TEXTS.aboutLabel,
          }) +
          composerBoxHtml({
            richKey: 'bio',
            slot: 'bio',
            label: 'About (biography)',
            hint: 'Press Enter for a new paragraph; highlight words to style them like an email',
            multiline: true,
            alignable: true,
            baseRem: 1,
            placeholder: 'Write the model’s biography here…',
          }) +
          '<div class="subhead">Search &amp; browser tab metadata</div>' +
          '<div class="grid">' +
            field('Browser tab tagline (optional)', 'tagline', m.tagline || '') +
            field('Search description (optional)', 'seo.description', seo.description || '') +
            '<label class="full" style="display:flex;gap:8px;align-items:center">' +
              '<input type="checkbox" data-field="seo.noindex"' + (seo.noindex ? ' checked' : '') + ' style="width:auto"> Hide this page from search engines</label>' +
          '</div>' +
        '</div>'
      ),

      sectionCard(
        'intro',
        'Introduction video (About)',
        uploadButton(S.model.introVideo && S.model.introVideo.file ? 'Replace introduction video' : 'Add introduction video', 'intro', ' accept="video/*"'),
        '<div class="list">' + introVideoHtml() + '</div>',
        'intro'
      ),

      sectionCard(
        'measurements',
        'Measurements',
        '<button type="button" class="btn icon-btn" data-action="add-stat" title="Add measurement" aria-label="Add measurement">' + icon('add') + '</button>',
        groupFormatBarHtml('stats', 'Measurements font:') + statsHtml()
      ),

      sectionCard(
        'contact',
        'Contact',
        '',
        '<div class="stack">' +
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
          }) +
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
          }) +
          '<div class="subhead">Contact links &amp; details</div>' +
          groupFormatBarHtml('contact', 'Contact details font:') +
          '<div class="grid">' +
            field('Email', 'contact.email', contact.email || '', '', 'contact') +
            field('Phone', 'contact.phone', contact.phone || '', '', 'contact') +
            field('WhatsApp number', 'contact.whatsapp', contact.whatsapp || '') +
            field('Instagram (full link)', 'contact.instagram', contact.instagram || '', '', 'contact') +
            field('LinkedIn (full link)', 'contact.linkedin', contact.linkedin || '', '', 'contact') +
            field('TikTok (full link)', 'contact.tiktok', contact.tiktok || '', '', 'contact') +
            field('IMDb (full link)', 'contact.imdb', contact.imdb || '', '', 'contact') +
            field('Website (full link)', 'contact.website', contact.website || '', '', 'contact') +
          '</div>' +
        '</div>'
      ),

      sectionCard(
        'cover',
        'Cover photos',
        uploadButton('Add cover photo', 'cover', ' accept="image/*" multiple'),
        '<div class="list">' + coverHtml() + '</div>',
        'cover'
      ),

      sectionCard(
        'portfolio',
        'Portfolio',
        ((m._groups && m._groups.length > 1)
          ? '<button type="button" class="btn icon-btn ghost" data-action="toggle-all-groups" aria-label="' + (areAllGroupsCollapsed() ? 'Expand all categories' : 'Collapse all categories') + '" title="' + (areAllGroupsCollapsed() ? 'Expand all categories' : 'Collapse all categories') + '">' + icon(areAllGroupsCollapsed() ? 'expand' : 'chevronDown') + '</button>'
          : '') +
          '<button type="button" class="btn icon-btn primary" data-action="add-group" aria-label="Add category" title="Add category">' + icon('add') + '</button>',
        '<div class="stack">' +
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
          '<div class="grid">' +
            groupFormatBarHtml('captions', 'Filters & photo captions font:') +
            groupFormatBarHtml('videoText', 'Video titles & descriptions font:') +
          '</div>' +
          '<div class="groups-stack">' + portfolioGroupsHtml() + '</div>' +
        '</div>'
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
    if (t.hasAttribute('data-group-title')) {
      var gIdx = Number(t.getAttribute('data-group-title'));
      var grp = S.model._groups && S.model._groups[gIdx];
      if (grp) {
        grp.title = t.value;
        var nextLabel = trimmed(t.value) || ('Group ' + (gIdx + 1));
        (S.model.videos || []).forEach(function (v) { if (v && v._gid === grp.id) v.category = nextLabel; });
        (S.model.photos || []).forEach(function (p) { if (p && p._gid === grp.id) p.category = nextLabel; });
        var root = $('editor-body');
        if (root) {
          var opts = root.querySelectorAll('select[data-move-item-group] option[value="' + grp.id + '"]');
          for (var o = 0; o < opts.length; o++) opts[o].textContent = nextLabel;
        }
      }
      updateDirtyNote();
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
    ['file', 'poster', 'thumbnail', 'preview', 'posterThumbnail', 'posterPreview'].forEach(function (key) {
      if (item[key]) files.push(item[key]);
    });
    (item.variants || []).forEach(function (v) { files.push(v.file); });
    files.forEach(function (f) {
      if (isHttp(f) && S.pendingDeletes.indexOf(f) === -1) S.pendingDeletes.push(f);
    });
    list.splice(i, 1);
    render();
  }

  function moveInGroup(listName, index, dir) {
    var items = S.model[listName];
    var cur = items && items[index];
    if (!cur) return;
    var gid = cur._gid;
    var j = index + dir;
    while (j >= 0 && j < items.length) {
      if (items[j] && items[j]._gid === gid) {
        var tmp = items[index];
        items[index] = items[j];
        items[j] = tmp;
        render();
        return;
      }
      j += dir;
    }
  }

  function removeGroupAt(gIdx) {
    var groups = S.model._groups || [];
    var grp = groups[gIdx];
    if (!grp) return;
    var vInGroup = (S.model.videos || []).filter(function (v) { return v && v._gid === grp.id; });
    var pInGroup = (S.model.photos || []).filter(function (p) { return p && p._gid === grp.id; });
    var total = vInGroup.length + pInGroup.length;
    var msg = total > 0
      ? 'Remove group "' + (trimmed(grp.title) || 'Untitled') + '" and its ' + total + ' item(s)? Hosted files are deleted when you save.'
      : 'Remove empty group "' + (trimmed(grp.title) || 'Untitled') + '"?';
    if (!window.confirm(msg)) return;

    vInGroup.concat(pInGroup).forEach(function (item) {
      (item.variants || []).forEach(function (v) { if (isHttp(v.file) && S.pendingDeletes.indexOf(v.file) === -1) S.pendingDeletes.push(v.file); });
      ['file', 'poster', 'thumbnail', 'preview', 'posterThumbnail', 'posterPreview'].forEach(function (key) {
        var file = item && item[key];
        if (file && isHttp(file) && S.pendingDeletes.indexOf(file) === -1) S.pendingDeletes.push(file);
      });
    });
    S.model.videos = (S.model.videos || []).filter(function (v) { return !v || v._gid !== grp.id; });
    S.model.photos = (S.model.photos || []).filter(function (p) { return !p || p._gid !== grp.id; });
    groups.splice(gIdx, 1);
    if (!groups.length) {
      groups.push({ id: nextGroupId(), title: 'Portfolio' });
    }
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
    if (action === 'toggle-section') {
      var toggleSid = btn.getAttribute('data-section-id');
      if (toggleSid) {
        if (S.collapsedSections[toggleSid]) delete S.collapsedSections[toggleSid];
        else S.collapsedSections[toggleSid] = true;
        syncSectionCollapseDom(toggleSid);
      }
      return;
    }
    if (action === 'remove-intro') {
      removeIntroVideo();
      return;
    }
    if (action === 'generate-variants') {
      generateThumbnails();
      return;
    }
    if (action === 'toggle-all-sections') {
      var collapseAllNext = !areAllSectionsCollapsed();
      SECTION_IDS.forEach(function (sid) {
        if (collapseAllNext) S.collapsedSections[sid] = true;
        else delete S.collapsedSections[sid];
        syncSectionCollapseDom(sid);
      });
      return;
    }
    if (action === 'toggle-group') {
      var toggleGid = btn.getAttribute('data-group-id');
      if (toggleGid) {
        if (S.collapsedGroups[toggleGid]) delete S.collapsedGroups[toggleGid];
        else S.collapsedGroups[toggleGid] = true;
        syncGroupCollapseDom(toggleGid);
      }
      return;
    }
    if (action === 'toggle-all-groups') {
      var allGroups = (S.model && S.model._groups) || [];
      var collapseNext = !areAllGroupsCollapsed();
      allGroups.forEach(function (g) {
        if (collapseNext) S.collapsedGroups[g.id] = true;
        else delete S.collapsedGroups[g.id];
        syncGroupCollapseDom(g.id);
      });
      return;
    }
    if (action === 'add-group') {
      if (!Array.isArray(S.model._groups)) S.model._groups = [];
      var newIdx = S.model._groups.length;
      var newGrpId = nextGroupId();
      delete S.collapsedSections.portfolio;
      delete S.collapsedGroups[newGrpId];
      S.model._groups.push({ id: newGrpId, title: 'Category ' + (newIdx + 1) });
      render();
      var titleInput = $('editor-body') && $('editor-body').querySelector('[data-group-title="' + newIdx + '"]');
      if (titleInput && typeof titleInput.focus === 'function') {
        titleInput.focus();
        if (typeof titleInput.select === 'function') titleInput.select();
      }
      return;
    }
    if (action === 'move-group') {
      var gIdx = Number(btn.getAttribute('data-group-index'));
      var gDir = Number(btn.getAttribute('data-dir'));
      var groups = S.model._groups || [];
      var gTarget = gIdx + gDir;
      if (gTarget < 0 || gTarget >= groups.length) return;
      var tmpGrp = groups[gIdx];
      groups[gIdx] = groups[gTarget];
      groups[gTarget] = tmpGrp;
      render();
      return;
    }
    if (action === 'remove-group') {
      removeGroupAt(Number(btn.getAttribute('data-group-index')));
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
    } else if (action === 'move-in-group') {
      moveInGroup(list, i, Number(btn.getAttribute('data-dir')));
    } else if (action === 'add-stat') {
      delete S.collapsedSections.measurements;
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

  function imageSizeViaBitmap(file) {
    if (typeof createImageBitmap !== 'function') return Promise.resolve(null);
    return createImageBitmap(file).then(function (bmp) {
      var size = { width: bmp.width, height: bmp.height };
      if (bmp.close) bmp.close();
      return size;
    }, function () { return null; });
  }

  function imageSize(file) {
    if (typeof window.Image !== 'function' || !window.URL || typeof window.URL.createObjectURL !== 'function') {
      return imageSizeViaBitmap(file);
    }
    return new Promise(function (resolve) {
      var url = '';
      var img = new window.Image();
      var done = false;
      var finish = function (size) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (url && window.URL && typeof window.URL.revokeObjectURL === 'function') {
          try { window.URL.revokeObjectURL(url); } catch (_) {}
        }
        if (size) resolve(size);
        else imageSizeViaBitmap(file).then(resolve);
      };
      var timer = setTimeout(function () { finish(null); }, 3000);
      img.onload = function () {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          finish({ width: img.naturalWidth, height: img.naturalHeight });
        } else {
          finish(null);
        }
      };
      img.onerror = function () { finish(null); };
      try {
        url = window.URL.createObjectURL(file);
        img.src = url;
      } catch (_) {
        finish(null);
      }
    });
  }

  function videoSize(file) {
    if (typeof document === 'undefined' || !window.URL || typeof window.URL.createObjectURL !== 'function') {
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      var url = '';
      var v = document.createElement('video');
      var done = false;
      var finish = function (size) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          v.removeAttribute('src');
          if (typeof v.load === 'function') v.load();
        } catch (_) {}
        if (url && window.URL && typeof window.URL.revokeObjectURL === 'function') {
          try { window.URL.revokeObjectURL(url); } catch (_) {}
        }
        resolve(size);
      };
      var timer = setTimeout(function () { finish(null); }, 4000);
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      v.addEventListener('loadedmetadata', function () {
        if (v.videoWidth > 0 && v.videoHeight > 0) {
          finish({ width: v.videoWidth, height: v.videoHeight });
        } else {
          finish(null);
        }
      });
      v.addEventListener('error', function () { finish(null); });
      try {
        url = window.URL.createObjectURL(file);
        v.src = url;
      } catch (_) {
        finish(null);
      }
    });
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

  function findEditorGroup(groupId) {
    var groups = (S.model && S.model._groups) || [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === groupId) return groups[i];
    }
    return groups[0] || null;
  }

  function onChange(e) {
    var input = e.target;
    if (input.hasAttribute('data-fmt') && (input.tagName === 'SELECT' || input.type === 'color')) {
      handleFormatControl(input, input.value);
      return;
    }
    if (input.hasAttribute('data-move-item-group')) {
      var listName = input.getAttribute('data-move-item-group');
      var itemIdx = Number(input.getAttribute('data-i'));
      var targetGrp = findEditorGroup(input.value);
      var targetItem = S.model && S.model[listName] && S.model[listName][itemIdx];
      if (targetGrp && targetItem) {
        delete S.collapsedGroups[targetGrp.id];
        targetItem._gid = targetGrp.id;
        targetItem.category = trimmed(targetGrp.title) || 'Portfolio';
        render();
      }
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
    var groupId = input.getAttribute('data-group-id') || '';
    var doneReset = function () {
      try { input.value = ''; } catch (_) {}
    };

    if (kind === 'poster') {
      uploadPoster(files[0], index).then(doneReset, doneReset);
      return;
    }

    if (kind === 'intro') {
      uploadIntroVideo(files[0]).then(doneReset, doneReset);
      return;
    }

    if (kind === 'intro-poster') {
      uploadIntroPoster(files[0]).then(doneReset, doneReset);
      return;
    }

    var cancelled = false;
    var batchInserted = 0;
    files.reduce(function (chain, file, idx) {
      return chain.then(function () {
        if (cancelled) return;
        return addMedia(kind, file, idx, files.length, groupId, batchInserted).then(function (res) {
          if (res && res.aborted) cancelled = true;
          else if (res && res.ok) batchInserted++;
        });
      });
    }, Promise.resolve()).then(doneReset, doneReset);
  }

  function shiftPosterUploadSlots(fromIndex) {
    var keys = Object.keys(S.uploads || {});
    var posterNums = [];
    keys.forEach(function (k) {
      if (k.indexOf('poster-') === 0) {
        var n = Number(k.slice(7));
        if (!isNaN(n) && n >= fromIndex) posterNums.push(n);
      }
    });
    posterNums.sort(function (a, b) { return b - a; }).forEach(function (n) {
      var oldKey = 'poster-' + n;
      var newKey = 'poster-' + (n + 1);
      S.uploads[newKey] = S.uploads[oldKey];
      delete S.uploads[oldKey];
      if (uploadDoneTimers[oldKey]) {
        clearTimeout(uploadDoneTimers[oldKey]);
        delete uploadDoneTimers[oldKey];
        scheduleUploadAutoClear(newKey);
      }
    });
  }

  function addMedia(kind, file, fileIndex, totalFiles, groupId, insertIndex) {
    var isVideo = kind === 'video';
    var insertPos = Math.max(0, Number(insertIndex) || 0);
    var targetGrp = (kind === 'photo' || kind === 'video') ? findEditorGroup(groupId) : null;
    if (kind === 'cover') delete S.collapsedSections.cover;
    else delete S.collapsedSections.portfolio;
    if (targetGrp) delete S.collapsedGroups[targetGrp.id];
    var slotId = targetGrp ? ('group-' + targetGrp.id) : kind;
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
          var pct = Math.min(isVideo ? 95 : 60, Math.max(1, Math.round((loaded / total) * (isVideo ? 95 : 60))));
          S.uploads[slotId].percent = pct;
          S.uploads[slotId].indeterminate = false;
          S.uploads[slotId].detail = (isVideo ? '' : 'Uploading original · ') + pct + '% · ' + formatBytes(loaded) + ' / ' + formatBytes(total);
        } else {
          S.uploads[slotId].indeterminate = true;
          S.uploads[slotId].detail = formatBytes(loaded) + ' sent…';
        }
        paintUploadSlot(slotId);
      },
      onSent: function () {
        if (!S.uploads[slotId] || S.uploads[slotId].state !== 'uploading') return;
        S.uploads[slotId].percent = isVideo ? 97 : 62;
        S.uploads[slotId].indeterminate = false;
        S.uploads[slotId].detail = isVideo ? '97% · Saving to cloud…' : 'Saving original to cloud…';
        S.uploads[slotId].canCancel = false;
        paintUploadSlot(slotId);
      },
    };

    var grpTitle = targetGrp ? (trimmed(targetGrp.title) || 'Portfolio') : 'Portfolio';
    var fallbackTitle = isVideo ? grpTitle : (kind === 'cover' ? 'Cover photo' : 'Photo ' + (S.model.photos.length + 1));

    return Promise.all([
      uploadFile(file, prep.uploadName, hooks),
      isVideo ? videoSize(file) : imageSize(file),
    ]).then(function (results) {
      var uploaded = results[0];
      var size = results[1];
      if (!isVideo && S.uploads[slotId]) {
        S.uploads[slotId].detail = 'Generating and uploading preview thumbnails…';
        S.uploads[slotId].percent = 64;
        paintUploadSlot(slotId);
      }
      var responsiveEntry = {};
      var variantError = '';
      return (isVideo
        ? Promise.resolve([{ url: '', error: '' }, { url: '', error: '' }])
        : Promise.all([
            makeAndUploadThumbnail(file, fileIndex),
            makeAndUploadThumbnail(file, fileIndex, 'preview'),
          ])).then(function (thumbnails) {
        if (isVideo) return thumbnails;
        var objectUrl = window.URL.createObjectURL(file);
        return generateImageVariants(objectUrl, [responsiveEntry], function (text, done, total) {
          if (!S.uploads[slotId]) return;
          S.uploads[slotId].percent = 65 + Math.round(34 * done / Math.max(1, total));
          S.uploads[slotId].detail = text;
          S.uploads[slotId].canCancel = false;
          paintUploadSlot(slotId);
        }).catch(function (err) {
          variantError = err.message || 'Variant generation failed.';
          if (window.__appErrorReporter) window.__appErrorReporter.report('frontend-thumbnail', variantError, { name: 'responsive-variants' });
        })
          .finally(function () { window.URL.revokeObjectURL(objectUrl); })
          .then(function () { return thumbnails; });
      }).then(function (thumbnails) {
        var thumbnail = thumbnails[0];
        var preview = thumbnails[1];
        if (kind === 'cover') {
          var coverIdx = Math.min(insertPos, S.model.cover.length);
          var coverEntry = { file: uploaded.url, alt: titleFrom(prep.uploadName, fallbackTitle) };
          if (responsiveEntry.variants) coverEntry.variants = responsiveEntry.variants;
          if (thumbnail.url) coverEntry.thumbnail = thumbnail.url;
          if (preview.url) coverEntry.preview = preview.url;
          S.model.cover.splice(coverIdx, 0, withSize(coverEntry, size));
        } else if (kind === 'photo') {
          var pEntry = withSize({
            file: uploaded.url,
            title: titleFrom(prep.uploadName, fallbackTitle),
            category: grpTitle,
            year: '',
            alt: '',
          }, size);
          if (responsiveEntry.variants) pEntry.variants = responsiveEntry.variants;
          if (thumbnail.url) pEntry.thumbnail = thumbnail.url;
          if (preview.url) pEntry.preview = preview.url;
          if (targetGrp) pEntry._gid = targetGrp.id;
          var photoIdx = Math.min(insertPos, S.model.photos.length);
          S.model.photos.splice(photoIdx, 0, pEntry);
        } else if (kind === 'video') {
          var vEntry = withSize({
            file: uploaded.url,
            title: grpTitle,
            category: grpTitle,
            description: '',
          }, size);
          if (targetGrp) vEntry._gid = targetGrp.id;
          var videoIdx = Math.min(insertPos, S.model.videos.length);
          shiftPosterUploadSlots(videoIdx);
          S.model.videos.splice(videoIdx, 0, vEntry);
        }
        S.abortUpload = null;
        var isLast = !(totalFiles > 1 && fileIndex + 1 < totalFiles);
        if (isLast) {
          S.activeUploadSlot = '';
          S.uploads[slotId] = {
            state: 'done',
            title: (totalFiles > 1 ? 'Uploaded ' + totalFiles + ' files' : 'Uploaded ' + prep.displayName),
            detail: (!isVideo && (variantError || thumbnail.error || preview.error))
              ? '100% · Original uploaded; some variants failed. Save, then retry Generate Thumbnails.'
              : '100% · Save changes to publish',
            percent: 100,
            indeterminate: false,
            canCancel: false,
          };
          scheduleUploadAutoClear(slotId);
        }
        var uploadStatus = 'Uploaded ' + prep.displayName + '. Save to publish it.';
        var thumbnailError = thumbnail.error || preview.error || variantError;
        if (!isVideo && thumbnailError) uploadStatus += ' Some thumbnails or responsive variants could not be generated; use Generate Thumbnails to retry. ' + thumbnailError;
        setStatus(uploadStatus, !isVideo && thumbnailError ? 'error' : 'ok');
        render();
        paintSavebarProgress();
        return { ok: true };
      });
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
      return makeAndUploadThumbnail(file, index).then(function (thumbnail) {
        if (video.poster && isHttp(video.poster) && S.pendingDeletes.indexOf(video.poster) === -1) {
          S.pendingDeletes.push(video.poster);
        }
        if (video.posterThumbnail && isHttp(video.posterThumbnail) && S.pendingDeletes.indexOf(video.posterThumbnail) === -1) {
          S.pendingDeletes.push(video.posterThumbnail);
        }
        if (video.posterPreview && isHttp(video.posterPreview) && S.pendingDeletes.indexOf(video.posterPreview) === -1) {
          S.pendingDeletes.push(video.posterPreview);
        }
        video.poster = uploaded.url;
        if (thumbnail.url) video.posterThumbnail = thumbnail.url;
        else delete video.posterThumbnail;
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
        setStatus(thumbnail.error
          ? 'Poster uploaded, but its thumbnail could not be generated. Use Generate Thumbnails to retry.'
          : 'Poster uploaded. Save to publish it.', thumbnail.error ? 'error' : 'ok');
        render();
        paintSavebarProgress();
      });
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

  // ---- About introduction video -----------------------------------------

  // Queues this profile's hosted files for deletion once the save succeeds.
  function queueIntroFileDeletes(intro, keepFile) {
    if (!intro) return;
    ['file', 'poster', 'posterThumbnail', 'posterPreview'].forEach(function (key) {
      var value = intro[key];
      if (value && isHttp(value) && value !== keepFile && S.pendingDeletes.indexOf(value) === -1) {
        S.pendingDeletes.push(value);
      }
    });
  }

  function removeIntroVideo() {
    var intro = S.model && S.model.introVideo;
    if (!intro) return;
    if (!window.confirm('Remove the introduction video? Hosted files are deleted when you save.')) return;
    queueIntroFileDeletes(intro, '');
    S.model.introVideo = null;
    delete S.uploads.intro;
    delete S.uploads['intro-poster'];
    render();
    setStatus('Introduction video removed. Save to publish the change.');
  }

  // Progress hooks shared by the introduction video uploads.
  function introUploadHooks(slotId, isVideo) {
    return {
      registerAbort: function (fn) { S.abortUpload = fn; },
      onProgress: function (loaded, total, computable) {
        if (!S.uploads[slotId] || S.uploads[slotId].state !== 'uploading') return;
        if (computable && total > 0) {
          var pct = Math.min(isVideo ? 95 : 60, Math.max(1, Math.round((loaded / total) * (isVideo ? 95 : 60))));
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
        S.uploads[slotId].percent = isVideo ? 97 : 62;
        S.uploads[slotId].indeterminate = false;
        S.uploads[slotId].detail = isVideo ? '97% · Saving to cloud…' : 'Saving poster to cloud…';
        S.uploads[slotId].canCancel = false;
        paintUploadSlot(slotId);
      },
    };
  }

  // Captures a still from the freshly uploaded video and stores it as the poster,
  // so the About frame never shows an empty black box.
  function captureIntroPoster() {
    var intro = S.model && S.model.introVideo;
    if (!intro || !intro.file || intro.poster) return Promise.resolve(true);
    return resolveThumbnailSource(intro.file).then(function (resolved) {
      return makeVideoThumbnail(resolved.url, 1280)
        .then(function (blob) { return uploadThumbnail(blob, 'intro-poster', 'thumbnail'); })
        .then(function (url) {
          if (S.model.introVideo === intro) intro.poster = url;
          return true;
        })
        .catch(function (err) {
          var message = (err && err.message) || 'A poster frame could not be captured.';
          if (window.__appErrorReporter) window.__appErrorReporter.report('frontend-thumbnail', message, { name: 'intro-video-poster' });
          return false;
        })
        .then(function (result) {
          if (resolved.revoke) resolved.revoke();
          return result;
        });
    }, function () { return false; });
  }

  function uploadIntroVideo(file) {
    var slotId = 'intro';
    var prep = prepareUploadFile(file, true);
    if (!prep.ok) {
      showUploadError(slotId, 'Cannot add introduction video', prep.error);
      return Promise.resolve();
    }

    delete S.collapsedSections.intro;
    clearTimeout(uploadDoneTimers[slotId]);
    S.activeUploadSlot = slotId;
    S.uploads[slotId] = {
      state: 'uploading',
      title: 'Uploading introduction video: ' + prep.displayName,
      detail: 'Preparing ' + formatBytes(file.size) + '…',
      percent: 0,
      indeterminate: true,
      canCancel: true,
    };
    setBusy(true, 'Uploading introduction video…');
    paintUploadSlot(slotId);

    return Promise.all([
      uploadFile(file, prep.uploadName, introUploadHooks(slotId, true)),
      videoSize(file),
    ]).then(function (results) {
      var uploaded = results[0];
      var size = results[1];
      queueIntroFileDeletes(S.model.introVideo, uploaded.url);
      var entry = { file: uploaded.url };
      if (size) { entry.width = size.width; entry.height = size.height; }
      S.model.introVideo = entry;
      S.abortUpload = null;
      S.activeUploadSlot = '';
      S.uploads[slotId] = {
        state: 'done',
        title: 'Introduction video uploaded',
        detail: '100% · Save changes to publish',
        percent: 100,
        indeterminate: false,
        canCancel: false,
      };
      scheduleUploadAutoClear(slotId);
      setStatus('Introduction video uploaded. Save to publish it.', 'ok');
      render();
      paintSavebarProgress();
      // The poster frame is captured in the background so a slow decode never
      // holds up the upload. Failure is harmless: a poster can be added by hand.
      captureIntroPoster().then(function (posterOk) {
        if (!posterOk || !S.model || !S.model.introVideo) return;
        render();
        setStatus('Poster frame captured for the introduction video. Save to publish it.', 'ok');
      });
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
      showUploadError(slotId, 'Introduction video upload failed', (err && err.message) || 'Upload failed.');
      render();
    }).then(function () {
      if (!S.activeUploadSlot) setBusy(false);
    });
  }

  function uploadIntroPoster(file) {
    var intro = S.model && S.model.introVideo;
    if (!intro) return Promise.resolve();
    var slotId = 'intro-poster';
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

    return Promise.all([
      uploadFile(file, prep.uploadName, introUploadHooks(slotId, false)),
      imageSize(file),
    ]).then(function (results) {
      var uploaded = results[0];
      var size = results[1];
      queueIntroFileDeletes({ poster: intro.poster, posterThumbnail: intro.posterThumbnail, posterPreview: intro.posterPreview }, '');
      intro.poster = uploaded.url;
      if (size) { intro.posterWidth = size.width; intro.posterHeight = size.height; }
      return makeAndUploadThumbnail(file, 'intro-poster', 'thumbnail').then(function (thumbnail) {
        if (thumbnail.url) intro.posterThumbnail = thumbnail.url;
        else delete intro.posterThumbnail;
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
        setStatus(thumbnail.error
          ? 'Poster uploaded, but its thumbnail could not be generated. Use Generate Thumbnails to retry.'
          : 'Poster uploaded. Save to publish it.', thumbnail.error ? 'error' : 'ok');
        render();
        paintSavebarProgress();
      });
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

  function syncAdminGroupOrientation(groupCard) {
    if (!groupCard) return;
    var thumbs = Array.prototype.slice.call(groupCard.querySelectorAll('.admin-media-card .thumb'));
    if (!thumbs.length) {
      groupCard.classList.remove('is-landscape-group');
      if (typeof groupCard.removeAttribute === 'function') groupCard.removeAttribute('data-landscape-group');
      return;
    }
    var dims = [];
    thumbs.forEach(function (el) {
      if (el.tagName === 'VIDEO' && el.videoWidth > 0 && el.videoHeight > 0) {
        dims.push({ w: el.videoWidth, h: el.videoHeight });
      } else if (el.tagName === 'IMG' && el.naturalWidth > 0 && el.naturalHeight > 0) {
        dims.push({ w: el.naturalWidth, h: el.naturalHeight });
      } else {
        var nw = Number(el.getAttribute && el.getAttribute('data-natural-w'));
        var nh = Number(el.getAttribute && el.getAttribute('data-natural-h'));
        if (nw > 0 && nh > 0) dims.push({ w: nw, h: nh });
      }
    });
    var allLandscape = dims.length === thumbs.length && dims.every(function (d) { return d.w > d.h; });
    groupCard.classList.toggle('is-landscape-group', allLandscape);
    if (allLandscape) groupCard.setAttribute('data-landscape-group', '1');
    else if (typeof groupCard.removeAttribute === 'function') groupCard.removeAttribute('data-landscape-group');
  }

  function onMediaReady(e) {
    var t = e.target;
    if (!t || (t.tagName !== 'IMG' && t.tagName !== 'VIDEO')) return;
    if (t.tagName === 'VIDEO' && t.videoWidth > 0 && t.videoHeight > 0) {
      var portrait = t.videoHeight > t.videoWidth;
      t.classList.toggle('portrait', portrait);
      t.classList.toggle('wide', !portrait);
    }
    var groupCard = t.closest ? t.closest('.group-card') : null;
    if (groupCard) syncAdminGroupOrientation(groupCard);
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

  // ---- Thumbnail generation --------------------------------------------

  var VARIANT_WIDTHS = [480, 960, 1600, 2400];
  function variantWidths(width) {
    return VARIANT_WIDTHS.map(function (w) { return Math.min(w, width); }).filter(function (w, i, all) { return all.indexOf(w) === i; });
  }
  function hasAllVariants(entry) {
    if (!entry || !entry.width) return false;
    return variantWidths(Number(entry.width)).every(function (width) {
      return ['avif', 'webp'].every(function (format) {
        return (entry.variants || []).some(function (v) { return v.width === width && v.format === format && v.file; });
      });
    });
  }

  // The public page only uses <picture> AVIF/WebP sources when a photo has WebP
  // variants; otherwise it serves the untouched original (often a multi-MB
  // camera JPEG). Photos added before variants existed, or whose generation
  // failed, stay that way until the backfill runs. Counted once per file.
  function photoVariantGaps() {
    var m = S.model || {};
    var files = {};
    (Array.isArray(m.cover) ? m.cover : []).concat(Array.isArray(m.photos) ? m.photos : []).forEach(function (entry) {
      if (!entry || !entry.file) return;
      var gap = files[String(entry.file)] || (files[String(entry.file)] = { original: false, incomplete: false });
      var hasWebp = (entry.variants || []).some(function (v) { return v && v.format === 'webp' && v.file && v.width > 0; });
      if (!hasWebp) gap.original = true;
      if (!hasAllVariants(entry)) gap.incomplete = true;
    });
    var counts = { original: 0, incomplete: 0 };
    Object.keys(files).forEach(function (file) {
      if (files[file].original) counts.original += 1;
      if (files[file].incomplete) counts.incomplete += 1;
    });
    return counts;
  }

  // A visible, labelled prompt for the backfill: the toolbar button is an
  // icon whose tooltip never appears on touch screens.
  function variantNoticeHtml() {
    var gaps = photoVariantGaps();
    if (!gaps.incomplete) return '';
    var count = gaps.original || gaps.incomplete;
    var noun = count === 1 ? '1 photo is' : count + ' photos are';
    var title = gaps.original ? noun + ' published as full-size originals' : noun + ' missing some AVIF/WebP sizes';
    var detail = gaps.original
      ? (count === 1 ? 'It has' : 'They have') + ' no AVIF or WebP versions yet, so visitors download the original files and the site loads slowly.'
      : 'Some sizes could not be created earlier, so some screens get a larger image than they need.';
    return '<div class="variant-notice" role="note" data-variant-notice>' +
      '<div class="variant-notice-text"><strong>' + esc(title) + '</strong>' +
        '<span>' + esc(detail) + ' Creating them takes a little while per photo and saves the profile when finished.</span></div>' +
      '<button type="button" class="btn primary small" id="variant-notice-generate" data-action="generate-variants"' + (S.busy ? ' disabled' : '') + '>Create AVIF/WebP versions</button>' +
    '</div>';
  }

  // One decoded original, sequential resizes/encodes, and one AVIF worker per
  // photo keep memory bounded. Persist each success so interrupted jobs resume.
  function generateImageVariants(source, entries, progress) {
    var image;
    var worker;
    var variants = [];
    entries.forEach(function (entry) {
      (entry.variants || []).forEach(function (variant) {
        if (!variants.some(function (v) { return v.width === variant.width && v.format === variant.format; })) variants.push(variant);
      });
    });
    var failures = [];
    entries.forEach(function (entry) { entry.variants = variants; });
    function notify(text, done, total) { if (progress) progress(text, done, total); }
    function encodeInWorker(canvas, format) {
      return new Promise(function (resolve, reject) {
        var activeWorker;
        var timer;
        function finish(error, blob) {
          clearTimeout(timer);
          if (activeWorker) {
            activeWorker.onmessage = activeWorker.onerror = null;
            // A timed-out worker must not deliver an old result to the next size.
            if (error) {
              activeWorker.terminate();
              if (worker === activeWorker) worker = null;
            }
          }
          if (error) reject(error);
          else resolve(blob);
        }
        try {
          if (!worker) worker = new window.Worker(new URL('image-variants-worker.js', window.location.href), { type: 'module' });
          activeWorker = worker;
          timer = setTimeout(function () { finish(new Error(format.toUpperCase() + ' encoding timed out. Retry Generate Thumbnails.')); }, 120000);
          activeWorker.onmessage = function (event) {
            if (event.data.error) finish(new Error(event.data.error));
            else finish(null, new Blob([event.data.buffer], { type: 'image/' + format }));
          };
          activeWorker.onerror = function () { finish(new Error('Could not start ' + format.toUpperCase() + ' encoder.')); };
          var pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          activeWorker.postMessage({ format: format, pixels: pixels.buffer, width: canvas.width, height: canvas.height }, [pixels.buffer]);
        } catch (err) { finish(err); }
      });
    }
    notify('Decoding original photo…', 0, 1);
    return new Promise(function (resolve, reject) {
      image = new window.Image();
      image.crossOrigin = 'anonymous';
      var timer = setTimeout(function () { image.onload = image.onerror = null; reject(new Error('Photo decoding timed out.')); }, 30000);
      image.onload = function () { clearTimeout(timer); resolve(); };
      image.onerror = function () { clearTimeout(timer); reject(new Error('Could not decode original photo.')); };
      image.src = source;
    }).then(function () {
      var width = image.naturalWidth || image.width;
      var height = image.naturalHeight || image.height;
      if (!width || !height) throw new Error('Original photo has no dimensions.');
      entries.forEach(function (entry) { entry.width = width; entry.height = height; });
      var jobs = [];
      variantWidths(width).forEach(function (w) {
        ['webp', 'avif'].forEach(function (format) {
          if (!variants.some(function (v) { return v.width === w && v.format === format && v.file; })) jobs.push({ width: w, format: format });
        });
      });
      return jobs.reduce(function (chain, job, index) {
        return chain.then(function () {
          notify('Encoding ' + job.width + 'px ' + job.format.toUpperCase() + ' (' + (index + 1) + '/' + jobs.length + ')…', index, jobs.length);
          var canvas = document.createElement('canvas');
          canvas.width = job.width;
          canvas.height = Math.max(1, Math.round(height * job.width / width));
          var ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('This browser cannot resize photos.');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          var encoded = job.format === 'avif' ? encodeInWorker(canvas, 'avif') : new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
              if (!blob || blob.type !== 'image/webp') {
                // WebKit may return PNG even when image/webp was requested.
                // Never upload that PNG under a .webp filename.
                notify('Encoding ' + job.width + 'px WEBP with compatibility encoder…', index, jobs.length);
                encodeInWorker(canvas, 'webp').then(resolve, reject);
              }
              else resolve(blob);
            }, 'image/webp', 0.82);
          });
          return encoded.then(function (blob) {
            notify('Uploading ' + job.width + 'px ' + job.format.toUpperCase() + ' (' + (index + 1) + '/' + jobs.length + ')…', index, jobs.length);
            return uploadThumbnail(blob, job.width + '-' + index, 'variant');
          }).then(function (url) {
            variants.push({ file: url, width: canvas.width, height: canvas.height, format: job.format });
            canvas.width = canvas.height = 1;
            notify('Saved ' + job.width + 'px ' + job.format.toUpperCase(), index + 1, jobs.length);
          });
        }).catch(function (err) {
          failures.push(job.width + 'px ' + job.format.toUpperCase() + ': ' + (err.message || 'generation failed'));
          notify('Could not generate ' + job.width + 'px ' + job.format.toUpperCase() + '; continuing…', index + 1, jobs.length);
        });
      }, Promise.resolve()).then(function () {
        if (failures.length) throw new Error(failures.join('; '));
      });
    }).finally(function () { if (worker) worker.terminate(); });
  }

  function thumbnailSource(file) {
    if (isHttp(file)) return file;
    return new URL('../' + encodeURIComponent(S.slug) + '/media/' + encodeURIComponent(String(file || '')), window.location.href).toString();
  }

  function thumbnailTargets() {
    var bySource = {};
    function add(sourceValue, entry, key, tier) {
      if (!sourceValue) return;
      var source = String(sourceValue);
      if (!bySource[source]) {
        bySource[source] = { source: source, thumbnailRefs: [], previewRefs: [], thumbnail: '', preview: '', imageRefs: [] };
      }
      var group = bySource[source];
      var ref = { entry: entry, key: key };
      if (tier === 'preview') {
        group.previewRefs.push(ref);
        if (!group.preview && entry[key]) group.preview = entry[key];
      } else {
        group.thumbnailRefs.push(ref);
        if (!group.thumbnail && entry[key]) group.thumbnail = entry[key];
      }
    }
    (S.model.cover || []).forEach(function (entry) {
      if (!entry || !entry.file) return;
      add(entry.file, entry, 'thumbnail', 'thumbnail');
      add(entry.file, entry, 'preview', 'preview');
      bySource[String(entry.file)].imageRefs.push(entry);
    });
    (S.model.photos || []).forEach(function (entry) {
      if (!entry || !entry.file) return;
      add(entry.file, entry, 'thumbnail', 'thumbnail');
      add(entry.file, entry, 'preview', 'preview');
      bySource[String(entry.file)].imageRefs.push(entry);
    });
    (S.model.videos || []).forEach(function (entry) {
      if (!entry) return;
      if (entry.poster) add(entry.poster, entry, 'posterThumbnail', 'thumbnail');
      else if (entry.file) {
        add(entry.file, entry, 'poster', 'thumbnail');
        add(entry.file, entry, 'posterThumbnail', 'thumbnail');
        bySource[String(entry.file)].isVideo = true;
      }
    });
    // The About introduction video gets a poster frame the same way.
    var introEntry = S.model.introVideo;
    if (introEntry && introEntry.file) {
      if (introEntry.poster) add(introEntry.poster, introEntry, 'posterThumbnail', 'thumbnail');
      else {
        add(introEntry.file, introEntry, 'poster', 'thumbnail');
        add(introEntry.file, introEntry, 'posterThumbnail', 'thumbnail');
        bySource[String(introEntry.file)].isVideo = true;
      }
    }
    return Object.keys(bySource).map(function (key) {
      var group = bySource[key];
      if (group.thumbnail) group.thumbnailRefs.forEach(function (ref) { if (!ref.entry[ref.key]) ref.entry[ref.key] = group.thumbnail; });
      if (group.preview) group.previewRefs.forEach(function (ref) { if (!ref.entry[ref.key]) ref.entry[ref.key] = group.preview; });
      return group;
    });
  }

  function resolveThumbnailSource(source) {
    var direct = thumbnailSource(source);
    if (!isHttp(source) || !window.URL || typeof window.URL.createObjectURL !== 'function') {
      return Promise.resolve({ url: direct, revoke: null });
    }
    var path = profilePath(S.slug, '/media?url=' + encodeURIComponent(source));
    return fetch(API_BASE + path, { headers: { Authorization: 'Bearer ' + S.token } }).then(function (res) {
      if (!res.ok) return { url: direct, revoke: null };
      return res.blob().then(function (blob) {
        var objectUrl = window.URL.createObjectURL(blob);
        return { url: objectUrl, revoke: function () { window.URL.revokeObjectURL(objectUrl); } };
      });
    }).catch(function () { return { url: direct, revoke: null }; });
  }

  function makeThumbnail(source, tier) {
    return new Promise(function (resolve, reject) {
      var image = new window.Image();
      image.crossOrigin = 'anonymous';
      image.onload = function () {
        try {
          var isPreview = tier === 'preview';
          var maxEdge = isPreview ? 64 : 360;
          var quality = isPreview ? 0.35 : 0.76;
          var scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
          canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
          var ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('This browser cannot create thumbnails.');
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('Could not encode thumbnail.')); return; }
            resolve(blob);
          }, 'image/webp', quality);
        } catch (err) { reject(err); }
      };
      image.onerror = function () { reject(new Error('Could not load image: ' + source)); };
      image.src = source;
    });
  }

  // Capture once in the admin instead of downloading video frames on every visit.
  function makeVideoThumbnail(source, maxEdge) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement('video');
      var settled = false;
      var timer = setTimeout(function () { finish(new Error('Video thumbnail generation timed out.')); }, 30000);
      function finish(error, blob) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.onloadedmetadata = video.onseeked = video.onerror = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        if (error) reject(error);
        else resolve(blob);
      }
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = function () {
        if (!video.videoWidth || !video.videoHeight || !isFinite(video.duration) || video.duration <= 0) {
          finish(new Error('Could not read video dimensions or duration.'));
          return;
        }
        // Seek beyond common black opening frames without requiring playback.
        video.currentTime = Math.min(1, video.duration * 0.15);
      };
      video.onseeked = function () {
        if (settled) return;
        try {
          var edge = maxEdge > 0 ? maxEdge : 360;
          var scale = Math.min(1, edge / Math.max(video.videoWidth, video.videoHeight));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          var ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('This browser cannot create video thumbnails.');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            finish(blob ? null : new Error('Could not encode video thumbnail.'), blob);
          }, 'image/webp', 0.76);
        } catch (err) { finish(err); }
      };
      video.onerror = function () { finish(new Error('Could not decode video. Try uploading a custom poster image.')); };
      video.src = source;
      video.load();
    });
  }

  function makeThumbnailFromFile(file, tier) {
    if (!window.URL || typeof window.URL.createObjectURL !== 'function') {
      return Promise.reject(new Error('This browser cannot read local image files.'));
    }
    var objectUrl = window.URL.createObjectURL(file);
    return makeThumbnail(objectUrl, tier).finally(function () {
      if (typeof window.URL.revokeObjectURL === 'function') window.URL.revokeObjectURL(objectUrl);
    });
  }

  function uploadThumbnail(blob, index, tier) {
    var form = new FormData();
    var ext = blob.type === 'image/avif' ? 'avif' : blob.type === 'image/png' ? 'png' : 'webp';
    var prefix = tier === 'variant' ? 'variant-' : tier === 'preview' ? 'preview-' : 'thumbnail-';
    form.append('file', blob, prefix + Date.now() + '-' + index + '.' + ext);
    return api('POST', profilePath(S.slug, '/media'), { form: form }).then(function (data) { return data.url; });
  }

  function makeAndUploadThumbnail(file, index, tier) {
    return makeThumbnailFromFile(file, tier)
      .then(function (blob) { return uploadThumbnail(blob, 'upload-' + index, tier); })
      .then(function (url) { return { url: url, error: '' }; })
      .catch(function (err) {
        var message = (err && err.message) || 'Thumbnail generation failed.';
        if (window.__appErrorReporter) window.__appErrorReporter.report('frontend-thumbnail', message, { name: 'cover-or-photo-thumbnail' });
        return { url: '', error: message };
      });
  }

  function paintGenerationProgress(percent, detail, outcome) {
    var panel = $('generation-progress');
    if (!panel) return;
    var pct = Math.max(0, Math.min(100, Math.round(percent)));
    panel.hidden = false;
    panel.className = 'generation-progress' + (outcome ? ' is-' + outcome : '');
    panel.innerHTML = '<div class="savebar-progress-head"><strong>Thumbnails &amp; variants</strong><span>' + pct + '%</span></div>' +
      '<div class="upload-track" role="progressbar" aria-label="Thumbnail and variant generation" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-valuetext="' + esc(detail) + '">' +
      '<div class="upload-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="generation-detail" role="status" aria-live="polite">' + esc(detail) + '</div>';
  }

  function generateThumbnails() {
    if (!S.model || S.busy) return;
    if (isDirty() && !window.confirm('Generating thumbnails will also save your current profile changes. Continue?')) return;
    var btn = $('generate-thumbnails');
    var groups = thumbnailTargets();
    var pending = groups.filter(function (group) {
      return (!group.thumbnail && group.thumbnailRefs.length) || (!group.preview && group.previewRefs.length) || group.imageRefs.some(function (entry) { return !hasAllVariants(entry); });
    });
    if (!pending.length) {
      paintGenerationProgress(100, 'Nothing to generate — all thumbnails and variants are ready.', 'done');
      setStatus('All model images and videos already have thumbnails and responsive variants.', 'ok');
      toast('All model images and videos already have thumbnails and responsive variants.', 'ok');
      return;
    }
    if (btn) { btn.disabled = true; btn.classList.add('is-working'); }
    setBusy(true, 'Generating thumbnails…');
    var failures = [];
    var generated = 0;
    var metadataChanged = false;
    var progressPercent = 0;
    function progress(index, fraction, text) {
      progressPercent = Math.max(progressPercent, 95 * (index + fraction) / pending.length);
      paintGenerationProgress(progressPercent, text);
    }
    paintGenerationProgress(0, 'Preparing ' + pending.length + ' media item(s)…');
    return pending.reduce(function (chain, group, index) {
      return chain.then(function () {
        var itemLabel = 'Media ' + (index + 1) + ' of ' + pending.length + ' · ';
        progress(index, 0, itemLabel + 'Loading original…');
        setStatus('Generating media thumbnails ' + (index + 1) + ' of ' + pending.length + '…');
        // Yield to browser between groups to keep UI responsive for large batches
        return Promise.resolve().then(function () {
          var jobs = [];
          if (!group.preview && group.previewRefs.length) jobs.push({ tier: 'preview', refs: group.previewRefs });
          if (!group.thumbnail && group.thumbnailRefs.length) jobs.push({ tier: 'thumbnail', refs: group.thumbnailRefs });
          return resolveThumbnailSource(group.source).then(function (resolved) {
          return jobs.reduce(function (jobChain, job, jobIndex) {
            return jobChain.then(function () {
              progress(index, 0.35 * jobIndex / Math.max(1, jobs.length), itemLabel + 'Generating ' + job.tier + '…');
              return (group.isVideo ? makeVideoThumbnail(resolved.url) : makeThumbnail(resolved.url, job.tier))
                .then(function (blob) {
                  progress(index, 0.35 * (jobIndex + 0.5) / Math.max(1, jobs.length), itemLabel + 'Uploading ' + job.tier + '…');
                  return uploadThumbnail(blob, (index + 1) + '-' + job.tier, job.tier);
                })
                .then(function (url) {
                  job.refs.forEach(function (ref) { ref.entry[ref.key] = url; });
                  if (job.tier === 'preview') group.preview = url;
                  else group.thumbnail = url;
                  generated += 1;
                })
                .catch(function (err) {
                  var message = err.message || 'A media file could not be processed.';
                  failures.push(message);
                  if (window.__appErrorReporter) window.__appErrorReporter.report('frontend-thumbnail', message, { resource: group.source, name: 'manual-thumbnail-generation' });
                });
            });
            }, Promise.resolve()).then(function () {
              if (!group.imageRefs.length) return;
              var before = JSON.stringify(group.imageRefs);
              return generateImageVariants(resolved.url, group.imageRefs, function (text, done, total) {
                progress(index, 0.35 + 0.65 * done / Math.max(1, total), itemLabel + text);
                setStatus('Photo ' + (index + 1) + '/' + pending.length + ' · ' + text);
                // Save even partial successful variants if a later encode fails.
                generated += text.indexOf('Saved ') === 0 ? 1 : 0;
              }).finally(function () {
                if (JSON.stringify(group.imageRefs) !== before) metadataChanged = true;
              });
            }).finally(function () { if (resolved.revoke) resolved.revoke(); });
          }).catch(function (err) {
            var message = err.message || 'A media file could not be processed.';
            failures.push(message);
            if (window.__appErrorReporter) window.__appErrorReporter.report('frontend-thumbnail', message, { resource: group.source, name: 'manual-thumbnail-generation' });
          });
        });
      }).finally(function () { progress(index, 1, 'Processed media ' + (index + 1) + ' of ' + pending.length); });
    }, Promise.resolve()).then(function () {
      if (generated || metadataChanged) {
        render();
        updateDirtyNote();
        setBusy(false);
        var message = generated
          ? 'Generated ' + generated + ' image variant' + (generated === 1 ? '' : 's') + ' and saved them to R2.'
          : 'Updated responsive image references and saved the profile.';
        if (failures.length) message += ' ' + failures.length + ' media file' + (failures.length === 1 ? ' could' : 's could') + ' not be processed.';
        paintGenerationProgress(98, 'Saving profile and generated image references…');
        return save(message).then(function (saved) {
          paintGenerationProgress(saved ? 100 : 98, saved
            ? (failures.length ? 'Finished with errors. Some variants failed; rerun to retry missing variants.' : 'Complete — all generated images and profile changes saved.')
            : 'Images generated, but profile save failed. Use Save to retry before leaving.',
            saved && !failures.length ? 'done' : 'error');
        });
      } else {
        setBusy(false);
        var errorMessage = failures.length ? failures[0] : 'No thumbnails were generated.';
        paintGenerationProgress(100, 'Generation failed: ' + errorMessage + ' Rerun to retry.', 'error');
        setStatus(errorMessage, 'error');
        toast(errorMessage, 'error');
      }
    }).catch(function (err) {
      setBusy(false);
      paintGenerationProgress(progressPercent, 'Generation stopped: ' + (err.message || 'Unexpected error') + '. Rerun to retry.', 'error');
      setStatus(err.message || 'Generation failed.', 'error');
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.classList.remove('is-working'); }
    });
  }

  function manageProfile(action) {
    if (!S.slug || S.isNew || S.busy) return;
    var slug = S.slug;
    var restore = action === 'restore';
    if (action === 'archive' && !window.confirm('Temporarily hide "' + slug + '" from the website? Its profile and media will be kept, and you can restore it later.')) return;
    if (restore && !window.confirm('Restore "' + slug + '" to the public website?')) return;
    if (action === 'permanent' && !window.confirm('Permanently delete "' + slug + '" and its R2 profile/media? This cannot be undone.')) return;

    var status = action === 'permanent' ? 'Deleting profile…' : (restore ? 'Restoring profile…' : 'Archiving profile…');
    setBusy(true, status);
    api('DELETE', profilePath(slug), { json: { action: action, sha: S.sha } }).then(function () {
      if (action === 'permanent') {
        S.models = S.models.filter(function (item) { return item !== slug; });
        S.archived = S.archived.filter(function (item) { return item !== slug; });
        S.model = null;
        S.slug = '';
        S.isNew = false;
        S.isArchived = false;
        S.sha = null;
        S.saved = '';
        S.pendingDeletes = [];
        rememberProfile('');
        renderPicker();
        $('editor-body').innerHTML = '';
        updateDirtyNote();
        setBusy(false);
        var next = S.models.filter(function (item) { return S.archived.indexOf(item) === -1; })[0] || S.models[0];
        if (next) return openProfile(next);
        setStatus('Profile permanently deleted. Create a profile to continue.', 'ok');
        return;
      }

      S.isArchived = !restore;
      S.archived = restore
        ? S.archived.filter(function (item) { return item !== slug; })
        : (S.archived.indexOf(slug) === -1 ? S.archived.concat([slug]) : S.archived);
      renderPicker();
      setBusy(false);
      setStatus(restore ? 'Profile restored and visible on the website.' : 'Profile archived and hidden from the website. Its data is retained.', 'ok');
    }).catch(function (err) {
      setBusy(false);
      var message = err.message || 'The profile action failed.';
      setStatus(message, 'error');
      toast(message, 'error');
    });
  }

  // ---- Saving -----------------------------------------------------------

  function save(successMessage) {
    if (!S.model || S.busy) return;
    hideToast();
    var model = cleanProfile(S.model);
    var savedSuccessfully = false;
    setBusy(true, 'Saving…');
    var path = profilePath(S.slug);
    return api('PUT', path, { json: { sha: S.sha, model: model } }).then(function (data) {
      S.sha = data.sha;
      S.saved = JSON.stringify(model);
      S.isNew = false;
      rememberProfile(S.slug);
      if (S.models.indexOf(S.slug) === -1) S.models.push(S.slug);
      S.models.sort();
      renderPicker();
      return removeHostedFiles();
    }).then(function () {
      var okMessage = typeof successMessage === 'string'
        ? successMessage
        : (S.isArchived ? 'Saved. Profile remains hidden from the public site.' : 'Saved. Changes are live immediately.');
      setStatus(okMessage, 'ok');
      toast(okMessage, 'ok');
      updateDirtyNote();
      savedSuccessfully = true;
    }).catch(function (err) {
      var detail = err.details && err.details.length ? ' ' + err.details.join(' ') : '';
      var message = (err.message || 'Saving failed.') + detail;
      setStatus(message, 'error');
      toast(message, 'error');
    }).then(function () { setBusy(false); return savedSuccessfully; });
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
  if ($('generate-thumbnails')) $('generate-thumbnails').addEventListener('click', generateThumbnails);
  if ($('archive-profile')) $('archive-profile').addEventListener('click', function () {
    manageProfile(S.isArchived ? 'restore' : 'archive');
  });
  if ($('delete-profile')) $('delete-profile').addEventListener('click', function () { manageProfile('permanent'); });
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

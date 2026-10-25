// Shared typography catalog, rich-text run sanitizer/renderer, validation, Google Fonts
// URL builder, and CSS variable helper.
// Pure runtime-agnostic JavaScript (zero Node.js imports) so it runs identically in
// static builds and Cloudflare Pages Functions / Workers.

export const FONT_CATALOG = [
  // Editorial & Luxury Serif
  {
    id: 'cormorant-garamond',
    label: 'Cormorant Garamond',
    category: 'Editorial & Luxury Serif',
    stack: "'Cormorant Garamond', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
    google: 'Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700',
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    category: 'Editorial & Luxury Serif',
    stack: "'Playfair Display', Georgia, serif",
    google: 'Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  {
    id: 'bodoni-moda',
    label: 'Bodoni Moda',
    category: 'Editorial & Luxury Serif',
    stack: "'Bodoni Moda', 'Didot', Georgia, serif",
    google: 'Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;0,6..96,600;0,6..96,700;1,6..96,400;1,6..96,500;1,6..96,600;1,6..96,700',
  },
  {
    id: 'eb-garamond',
    label: 'EB Garamond',
    category: 'Editorial & Luxury Serif',
    stack: "'EB Garamond', Garamond, Georgia, serif",
    google: 'EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  {
    id: 'lora',
    label: 'Lora',
    category: 'Editorial & Luxury Serif',
    stack: "'Lora', Georgia, serif",
    google: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
  },
  {
    id: 'libre-baskerville',
    label: 'Libre Baskerville',
    category: 'Editorial & Luxury Serif',
    stack: "'Libre Baskerville', Baskerville, Georgia, serif",
    google: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400',
  },
  {
    id: 'instrument-serif',
    label: 'Instrument Serif',
    category: 'Editorial & Luxury Serif',
    stack: "'Instrument Serif', Georgia, serif",
    google: 'Instrument+Serif:ital@0;1',
  },
  {
    id: 'cinzel',
    label: 'Cinzel',
    category: 'Editorial & Luxury Serif',
    stack: "'Cinzel', 'Trajan Pro', Georgia, serif",
    google: 'Cinzel:wght@400;500;600;700',
  },

  // Modern & Studio Sans
  {
    id: 'inter',
    label: 'Inter',
    category: 'Modern & Studio Sans',
    stack: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    google: 'Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,300;1,14..32,400;1,14..32,500;1,14..32,600;1,14..32,700',
  },
  {
    id: 'jost',
    label: 'Jost',
    category: 'Modern & Studio Sans',
    stack: "'Jost', 'Futura', system-ui, sans-serif",
    google: 'Jost:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    category: 'Modern & Studio Sans',
    stack: "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
    google: 'Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700',
  },
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    category: 'Modern & Studio Sans',
    stack: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    google: 'Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    category: 'Modern & Studio Sans',
    stack: "'DM Sans', system-ui, -apple-system, sans-serif",
    google: 'DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300;1,9..40,400;1,9..40,500;1,9..40,600;1,9..40,700',
  },
  {
    id: 'syne',
    label: 'Syne',
    category: 'Modern & Studio Sans',
    stack: "'Syne', system-ui, sans-serif",
    google: 'Syne:wght@400;500;600;700',
  },

  // Couture & Signature Script
  {
    id: 'pinyon-script',
    label: 'Pinyon Script',
    category: 'Couture & Signature Script',
    stack: "'Pinyon Script', cursive",
    google: 'Pinyon+Script',
  },
  {
    id: 'great-vibes',
    label: 'Great Vibes',
    category: 'Couture & Signature Script',
    stack: "'Great Vibes', cursive",
    google: 'Great+Vibes',
  },
];

export const FONT_BY_ID = new Map(FONT_CATALOG.map((f) => [f.id, f]));

export const FONT_SLOTS = {
  name: { label: 'Name', defaultFamily: 'cormorant-garamond', defaultStyle: 'italic', defaultWeight: '500' },
  headings: { label: 'Headings', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500' },
  aboutLabel: { label: 'About label', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '600' },
  bio: { label: 'About', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400' },
  stats: { label: 'Measurements', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '400' },
  portfolioLabel: { label: 'Portfolio label', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '600' },
  portfolioHeading: { label: 'Portfolio heading', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500' },
  captions: { label: 'Photo captions & filters', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400' },
  videosLabel: { label: 'Videos label', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '600' },
  videosHeading: { label: 'Videos heading', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500' },
  videoText: { label: 'Video titles & descriptions', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500' },
  contactLabel: { label: 'Contact label', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '600' },
  contactHeading: { label: 'Contact heading', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '400' },
  contact: { label: 'Contact details', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400' },
};

export const DEFAULT_TEXTS = {
  aboutLabel: 'About',
  portfolioLabel: 'Selected work',
  portfolioHeading: 'Portfolio',
  videosLabel: 'Motion',
  videosHeading: 'Videos',
  contactLabel: 'Bookings & enquiries',
  contactHeading: 'Let’s create something beautiful together.',
};

export const RICH_SINGLE_LINE_KEYS = new Set([
  'name',
  'aboutLabel',
  'portfolioLabel',
  'portfolioHeading',
  'videosLabel',
  'videosHeading',
  'contactLabel',
  'contactHeading',
]);

export const FONT_STYLES = new Set(['normal', 'italic']);
export const FONT_WEIGHTS = new Set(['300', '400', '500', '600', '700']);
export const FONT_SIZE_SCALE = { sm: '0.86', md: '1', lg: '1.18', xl: '1.38' };
export const FONT_SIZE_EM = { sm: '0.86em', md: '1em', lg: '1.2em', xl: '1.42em' };
export const FONT_ALIGNS = new Set(['left', 'center', 'right']);
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_INTER_HREF = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
const SELF_HOSTED_CORMORANT_VARIANTS = new Set(['normal:400', 'normal:500', 'normal:600', 'italic:400']);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

// Validates an optional `model.fonts` object.
export function validateFonts(fonts) {
  if (fonts === undefined) return [];
  if (!fonts || typeof fonts !== 'object' || Array.isArray(fonts)) {
    return ['"fonts" must be an object.'];
  }
  const errors = [];
  for (const [slot, spec] of Object.entries(fonts)) {
    if (!Object.prototype.hasOwnProperty.call(FONT_SLOTS, slot)) {
      errors.push(`"fonts.${slot}" is not a supported text box.`);
      continue;
    }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      errors.push(`"fonts.${slot}" must be an object.`);
      continue;
    }
    if (spec.family !== undefined && !FONT_BY_ID.has(spec.family)) {
      errors.push(`"fonts.${slot}.family" ("${spec.family}") is not a supported font.`);
    }
    if (spec.style !== undefined && !FONT_STYLES.has(spec.style)) {
      errors.push(`"fonts.${slot}.style" must be "normal" or "italic".`);
    }
    if (spec.weight !== undefined && !FONT_WEIGHTS.has(String(spec.weight))) {
      errors.push(`"fonts.${slot}.weight" must be one of 300, 400, 500, 600 or 700.`);
    }
    if (spec.size !== undefined && !Object.prototype.hasOwnProperty.call(FONT_SIZE_SCALE, spec.size)) {
      errors.push(`"fonts.${slot}.size" must be "sm", "md", "lg" or "xl".`);
    }
    if (spec.underline !== undefined && typeof spec.underline !== 'boolean') {
      errors.push(`"fonts.${slot}.underline" must be true or false.`);
    }
    if (spec.color !== undefined && !HEX_COLOR_PATTERN.test(String(spec.color))) {
      errors.push(`"fonts.${slot}.color" must be a 6-digit hex colour such as "#15130f".`);
    }
    if (spec.align !== undefined && !FONT_ALIGNS.has(spec.align)) {
      errors.push(`"fonts.${slot}.align" must be "left", "center" or "right".`);
    }
  }
  return errors;
}

// Validates optional `model.texts` overrides for section labels and headings.
export function validateTexts(texts) {
  if (texts === undefined) return [];
  if (!texts || typeof texts !== 'object' || Array.isArray(texts)) {
    return ['"texts" must be an object.'];
  }
  const errors = [];
  for (const [key, value] of Object.entries(texts)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_TEXTS, key)) {
      errors.push(`"texts.${key}" is not a supported text field.`);
      continue;
    }
    if (typeof value !== 'string' || !value.trim() || value.length > 500) {
      errors.push(`"texts.${key}" must be non-empty text (up to 500 characters).`);
    }
  }
  return errors;
}

function validateRunList(runs, where, errors) {
  if (!Array.isArray(runs) || !runs.length) {
    errors.push(`"${where}" must be a non-empty list of text runs.`);
    return;
  }
  for (const [i, run] of runs.entries()) {
    const loc = `${where}[${i}]`;
    if (!run || typeof run !== 'object' || Array.isArray(run)) {
      errors.push(`"${loc}" must be an object.`);
      continue;
    }
    if (typeof run.text !== 'string' || run.text.length === 0) {
      errors.push(`"${loc}.text" must be non-empty text.`);
    }
    if (run.family !== undefined && !FONT_BY_ID.has(run.family)) {
      errors.push(`"${loc}.family" ("${run.family}") is not a supported font.`);
    }
    if (run.size !== undefined && !Object.prototype.hasOwnProperty.call(FONT_SIZE_EM, run.size)) {
      errors.push(`"${loc}.size" must be "sm", "md", "lg" or "xl".`);
    }
    if (run.bold !== undefined && typeof run.bold !== 'boolean') {
      errors.push(`"${loc}.bold" must be true or false.`);
    }
    if (run.italic !== undefined && typeof run.italic !== 'boolean') {
      errors.push(`"${loc}.italic" must be true or false.`);
    }
    if (run.underline !== undefined && typeof run.underline !== 'boolean') {
      errors.push(`"${loc}.underline" must be true or false.`);
    }
    if (run.color !== undefined && !HEX_COLOR_PATTERN.test(String(run.color))) {
      errors.push(`"${loc}.color" must be a 6-digit hex colour.`);
    }
  }
}

// Validates optional `model.richText` inline formatting runs.
export function validateRichText(richText) {
  if (richText === undefined) return [];
  if (!richText || typeof richText !== 'object' || Array.isArray(richText)) {
    return ['"richText" must be an object.'];
  }
  const errors = [];
  for (const [key, value] of Object.entries(richText)) {
    if (key === 'bio') {
      if (!Array.isArray(value)) {
        errors.push('"richText.bio" must be a list of paragraphs.');
      } else {
        value.forEach((para, idx) => validateRunList(para, `richText.bio[${idx}]`, errors));
      }
      continue;
    }
    if (!RICH_SINGLE_LINE_KEYS.has(key)) {
      errors.push(`"richText.${key}" is not a supported rich-text field.`);
      continue;
    }
    validateRunList(value, `richText.${key}`, errors);
  }
  return errors;
}

export function validateTypography(model) {
  if (!model || typeof model !== 'object') return [];
  return [
    ...validateFonts(model.fonts),
    ...validateTexts(model.texts),
    ...validateRichText(model.richText),
  ];
}

export function runsToPlainText(runs) {
  if (!Array.isArray(runs)) return '';
  return runs.map((r) => (r && typeof r.text === 'string' ? r.text : '')).join('');
}

// Safely renders an array of inline runs to HTML. Every character of user text is HTML-escaped
// and only allowlisted font stacks, relative sizes, booleans, and 6-digit hex colours are emitted.
export function renderRuns(runs) {
  if (!Array.isArray(runs) || !runs.length) return '';
  return runs
    .map((run) => {
      if (!run || typeof run.text !== 'string' || !run.text) return '';
      let html = escHtml(run.text);
      if (run.bold === true) html = `<strong>${html}</strong>`;
      if (run.italic === true) html = `<em>${html}</em>`;
      const styles = [];
      if (run.family && FONT_BY_ID.has(run.family)) {
        styles.push(`font-family:${FONT_BY_ID.get(run.family).stack}`);
      }
      if (run.size && FONT_SIZE_EM[run.size]) {
        styles.push(`font-size:${FONT_SIZE_EM[run.size]}`);
      }
      if (run.underline === true) {
        styles.push('text-decoration:underline');
      }
      if (run.color && HEX_COLOR_PATTERN.test(run.color)) {
        styles.push(`color:${run.color}`);
      }
      if (styles.length) {
        html = `<span style="${escHtml(styles.join(';'))}">${html}</span>`;
      }
      return html;
    })
    .join('');
}

// Splits rich-text runs for `model.name` into `{ givenRuns, familyRuns }` at the last whitespace
// so the two-part `.brand-given` / `.brand-family` header lockup preserves inline formatting.
export function splitNameRuns(runs) {
  const full = runsToPlainText(runs).trim();
  const match = /^(.*\S)\s+(\S+)$/.exec(full);
  if (!match) {
    return { givenRuns: runs, familyRuns: [] };
  }
  const splitAt = full.lastIndexOf(match[2]);
  // Trim leading/trailing whitespace across runs first.
  const trimmedRuns = [];
  let seenNonSpace = false;
  for (const run of runs) {
    if (!run || typeof run.text !== 'string') continue;
    let t = run.text;
    if (!seenNonSpace) {
      t = t.replace(/^\s+/, '');
      if (!t) continue;
      seenNonSpace = true;
    }
    trimmedRuns.push({ ...run, text: t });
  }
  while (trimmedRuns.length) {
    const last = trimmedRuns[trimmedRuns.length - 1];
    last.text = last.text.replace(/\s+$/, '');
    if (last.text) break;
    trimmedRuns.pop();
  }

  const givenRuns = [];
  const familyRuns = [];
  let cursor = 0;
  const givenEnd = match[1].length;
  for (const run of trimmedRuns) {
    const start = cursor;
    const end = cursor + run.text.length;
    cursor = end;
    if (end <= givenEnd) {
      givenRuns.push(run);
    } else if (start >= splitAt) {
      familyRuns.push(run);
    } else {
      if (start < givenEnd) {
        givenRuns.push({ ...run, text: run.text.slice(0, givenEnd - start) });
      }
      if (end > splitAt) {
        familyRuns.push({ ...run, text: run.text.slice(splitAt - start) });
      }
    }
  }
  return { givenRuns, familyRuns };
}

// Builds the Google Fonts stylesheet URL needed for both box-level `model.fonts`
// and any inline word-level font choices inside `model.richText`.
export function googleFontsHrefFor(fonts, richText) {
  const extraFamilies = new Set();
  let needsInterItalic = false;

  const registerFontUse = (familyId, style, weight) => {
    if (!familyId || !FONT_BY_ID.has(familyId)) return;
    if (familyId === 'inter') {
      if (style === 'italic') needsInterItalic = true;
      return;
    }
    if (familyId === 'cormorant-garamond') {
      if (!SELF_HOSTED_CORMORANT_VARIANTS.has(`${style}:${weight}`)) {
        extraFamilies.add(FONT_BY_ID.get('cormorant-garamond').google);
      }
      return;
    }
    const entry = FONT_BY_ID.get(familyId);
    if (entry?.google) extraFamilies.add(entry.google);
  };

  if (fonts && typeof fonts === 'object' && !Array.isArray(fonts)) {
    for (const [slot, slotMeta] of Object.entries(FONT_SLOTS)) {
      const spec = fonts[slot];
      if (!spec || typeof spec !== 'object') continue;
      const familyId = FONT_BY_ID.has(spec.family) ? spec.family : slotMeta.defaultFamily;
      const style = FONT_STYLES.has(spec.style) ? spec.style : slotMeta.defaultStyle;
      const weight = FONT_WEIGHTS.has(String(spec.weight)) ? String(spec.weight) : slotMeta.defaultWeight;
      registerFontUse(familyId, style, weight);
    }
  }

  const scanRuns = (runs) => {
    if (!Array.isArray(runs)) return;
    for (const run of runs) {
      if (!run || typeof run !== 'object') continue;
      if (run.family && FONT_BY_ID.has(run.family)) {
        registerFontUse(run.family, run.italic ? 'italic' : 'normal', run.bold ? '700' : '400');
      } else if (run.italic) {
        needsInterItalic = true;
      }
    }
  };

  if (richText && typeof richText === 'object' && !Array.isArray(richText)) {
    for (const [key, value] of Object.entries(richText)) {
      if (key === 'bio' && Array.isArray(value)) value.forEach(scanRuns);
      else scanRuns(value);
    }
  }

  if (!extraFamilies.size && !needsInterItalic) return DEFAULT_INTER_HREF;

  const interSpec = needsInterItalic
    ? FONT_BY_ID.get('inter').google
    : 'Inter:wght@300;400;500;600;700';
  const allSpecs = [interSpec, ...extraFamilies];
  return `https://fonts.googleapis.com/css2?${allSpecs.map((s) => `family=${s}`).join('&')}&display=swap`;
}

const SLOT_CSS_PREFIX = {
  name: 'name',
  headings: 'headings',
  aboutLabel: 'about-label',
  bio: 'bio',
  stats: 'stats',
  portfolioLabel: 'portfolio-label',
  portfolioHeading: 'portfolio-heading',
  captions: 'captions',
  videosLabel: 'videos-label',
  videosHeading: 'videos-heading',
  videoText: 'video-text',
  contactLabel: 'contact-label',
  contactHeading: 'contact-heading',
  contact: 'contact',
};

// Emits scoped CSS custom properties (`--font-<slot>-*`) for `<body style="...">`.
export function fontStyleVarsFor(fonts) {
  if (!fonts || typeof fonts !== 'object' || Array.isArray(fonts)) return '';
  const vars = [];

  for (const [slot, prefix] of Object.entries(SLOT_CSS_PREFIX)) {
    const spec = fonts[slot];
    if (!spec || typeof spec !== 'object') continue;

    if (spec.family && FONT_BY_ID.has(spec.family)) {
      const stack = FONT_BY_ID.get(spec.family).stack;
      vars.push(`--font-${prefix}-family: ${stack}`);
      if (slot === 'aboutLabel') vars.push(`--font-stats-label-family: ${stack}`);
      if (slot === 'captions') vars.push(`--font-captions-lb-family: ${stack}`);
    }
    if (spec.style && FONT_STYLES.has(spec.style)) {
      vars.push(`--font-${prefix}-style: ${spec.style}`);
      if (slot === 'aboutLabel') vars.push(`--font-stats-label-style: ${spec.style}`);
    }
    if (spec.weight !== undefined && FONT_WEIGHTS.has(String(spec.weight))) {
      const w = String(spec.weight);
      vars.push(`--font-${prefix}-weight: ${w}`);
      if (slot === 'aboutLabel') vars.push(`--font-stats-label-weight: ${w}`);
      if (slot === 'headings') vars.push(`--font-contact-heading-weight: ${w}`);
      if (slot === 'captions') vars.push(`--font-captions-strong-weight: ${w}`);
      if (slot === 'contact') vars.push(`--font-contact-strong-weight: ${w}`);
    }
    if (spec.size && Object.prototype.hasOwnProperty.call(FONT_SIZE_SCALE, spec.size)) {
      vars.push(`--font-${prefix}-scale: ${FONT_SIZE_SCALE[spec.size]}`);
    }
    if (spec.underline === true) {
      vars.push(`--font-${prefix}-decoration: underline`);
    } else if (spec.underline === false) {
      vars.push(`--font-${prefix}-decoration: none`);
    }
    if (spec.color && HEX_COLOR_PATTERN.test(spec.color)) {
      vars.push(`--font-${prefix}-color: ${spec.color}`);
      if (slot === 'aboutLabel') vars.push(`--font-stats-label-color: ${spec.color}`);
    }
    if (spec.align && FONT_ALIGNS.has(spec.align)) {
      vars.push(`--font-${prefix}-align: ${spec.align}`);
    }
  }

  return vars.join('; ');
}

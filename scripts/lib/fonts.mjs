// Shared typography catalog, validation, Google Fonts URL builder, and CSS variable
// helper. Pure runtime-agnostic JavaScript (zero Node.js imports) so it runs in both
// the static build and Cloudflare Pages Functions / Workers.

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
  name: { label: 'Name (header)', defaultFamily: 'cormorant-garamond', defaultStyle: 'italic', defaultWeight: '500' },
  headings: { label: 'Headings', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '500' },
  bio: { label: 'About (biography)', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400' },
  stats: { label: 'Measurements', defaultFamily: 'cormorant-garamond', defaultStyle: 'normal', defaultWeight: '400' },
  captions: { label: 'Contact & captions', defaultFamily: 'inter', defaultStyle: 'normal', defaultWeight: '400' },
};

export const FONT_STYLES = new Set(['normal', 'italic']);
export const FONT_WEIGHTS = new Set(['300', '400', '500', '600', '700']);

const DEFAULT_INTER_HREF = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
const SELF_HOSTED_CORMORANT_VARIANTS = new Set(['normal:400', 'normal:500', 'normal:600', 'italic:400']);

// Validates an optional `model.fonts` object. Returns a list of human-readable errors.
export function validateFonts(fonts) {
  if (fonts === undefined) return [];
  if (!fonts || typeof fonts !== 'object' || Array.isArray(fonts)) {
    return ['"fonts" must be an object.'];
  }
  const errors = [];
  for (const [slot, spec] of Object.entries(fonts)) {
    if (!Object.prototype.hasOwnProperty.call(FONT_SLOTS, slot)) {
      errors.push(`"fonts.${slot}" is not a supported text section.`);
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
  }
  return errors;
}

// Builds the Google Fonts stylesheet URL needed for a model's chosen typography.
// Keeps the exact baseline Inter stylesheet when no extra Google Font variants are used.
export function googleFontsHrefFor(fonts) {
  if (!fonts || typeof fonts !== 'object' || Array.isArray(fonts)) return DEFAULT_INTER_HREF;

  const extraFamilies = new Set();
  let needsInterItalic = false;

  for (const [slot, slotMeta] of Object.entries(FONT_SLOTS)) {
    const spec = fonts[slot];
    if (!spec || typeof spec !== 'object') continue;
    const familyId = FONT_BY_ID.has(spec.family) ? spec.family : slotMeta.defaultFamily;
    const style = FONT_STYLES.has(spec.style) ? spec.style : slotMeta.defaultStyle;
    const weight = FONT_WEIGHTS.has(String(spec.weight)) ? String(spec.weight) : slotMeta.defaultWeight;

    if (familyId === 'inter') {
      if (style === 'italic') needsInterItalic = true;
      continue;
    }
    if (familyId === 'cormorant-garamond') {
      if (!SELF_HOSTED_CORMORANT_VARIANTS.has(`${style}:${weight}`)) {
        extraFamilies.add(FONT_BY_ID.get('cormorant-garamond').google);
      }
      continue;
    }
    const entry = FONT_BY_ID.get(familyId);
    if (entry?.google) extraFamilies.add(entry.google);
  }

  if (!extraFamilies.size && !needsInterItalic) return DEFAULT_INTER_HREF;

  const interSpec = needsInterItalic
    ? FONT_BY_ID.get('inter').google
    : 'Inter:wght@300;400;500;600;700';
  const allSpecs = [interSpec, ...extraFamilies];
  return `https://fonts.googleapis.com/css2?${allSpecs.map((s) => `family=${s}`).join('&')}&display=swap`;
}

// Builds inline CSS custom property declarations for `<body style="...">` on a model page.
// Only allowlisted stacks, styles, and numeric weights can ever be emitted.
export function fontStyleVarsFor(fonts) {
  if (!fonts || typeof fonts !== 'object' || Array.isArray(fonts)) return '';
  const vars = [];

  const apply = (slot, handlers) => {
    const spec = fonts[slot];
    if (!spec || typeof spec !== 'object') return;
    if (spec.family && FONT_BY_ID.has(spec.family)) {
      handlers.family(FONT_BY_ID.get(spec.family).stack);
    }
    if (spec.style && FONT_STYLES.has(spec.style)) {
      handlers.style(spec.style);
    }
    if (spec.weight !== undefined && FONT_WEIGHTS.has(String(spec.weight))) {
      handlers.weight(String(spec.weight));
    }
  };

  apply('name', {
    family: (v) => vars.push(`--font-name-family: ${v}`),
    style: (v) => vars.push(`--font-name-style: ${v}`),
    weight: (v) => vars.push(`--font-name-weight: ${v}`),
  });

  apply('headings', {
    family: (v) => vars.push(`--font-headings-family: ${v}`),
    style: (v) => vars.push(`--font-headings-style: ${v}`),
    weight: (v) => {
      vars.push(`--font-headings-weight: ${v}`);
      vars.push(`--font-contact-heading-weight: ${v}`);
    },
  });

  apply('bio', {
    family: (v) => vars.push(`--font-bio-family: ${v}`),
    style: (v) => vars.push(`--font-bio-style: ${v}`),
    weight: (v) => vars.push(`--font-bio-weight: ${v}`),
  });

  apply('stats', {
    family: (v) => {
      vars.push(`--font-stats-family: ${v}`);
      vars.push(`--font-stats-label-family: ${v}`);
    },
    style: (v) => {
      vars.push(`--font-stats-style: ${v}`);
      vars.push(`--font-stats-label-style: ${v}`);
    },
    weight: (v) => vars.push(`--font-stats-weight: ${v}`),
  });

  apply('captions', {
    family: (v) => {
      vars.push(`--font-captions-family: ${v}`);
      vars.push(`--font-captions-lb-family: ${v}`);
    },
    style: (v) => vars.push(`--font-captions-style: ${v}`),
    weight: (v) => {
      vars.push(`--font-captions-weight: ${v}`);
      vars.push(`--font-captions-strong-weight: ${v}`);
    },
  });

  return vars.join('; ');
}

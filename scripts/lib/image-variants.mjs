// Shared schema for responsive image derivatives stored beside an original.
export function variantErrors(entry, validFile) {
  if (entry?.variants === undefined) return [];
  if (!Array.isArray(entry.variants) || entry.variants.length > 8) return ['variants must be a list of at most eight images'];
  const seen = new Set();
  const errors = [];
  for (const variant of entry.variants) {
    if (!variant || !['avif', 'webp'].includes(variant.format) || !validFile(variant.file) ||
        !Number.isInteger(variant.width) || variant.width < 1 || variant.width > 2400 ||
        !Number.isInteger(variant.height) || variant.height < 1 || variant.height > 100000 ||
        (entry.width && variant.width > Number(entry.width))) {
      errors.push('each variant needs a valid file, AVIF/WebP format and positive dimensions (width at most 2400; no upscaling)');
      continue;
    }
    const path = String(variant.file).split(/[?#]/)[0].toLowerCase();
    if (!path.endsWith('.' + variant.format)) errors.push('variant file extension must match its format');
    const key = variant.format + ':' + variant.width;
    if (seen.has(key)) errors.push('variant widths must be unique within each format');
    seen.add(key);
  }
  return errors;
}

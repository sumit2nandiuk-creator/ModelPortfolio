// Reads the pixel dimensions of a PNG or JPEG from its header bytes.
// Used so <img> tags can carry width/height and the gallery doesn't jump
// around while images load. Returns null for anything it can't parse.

// Reads EXIF IFD0 Orientation (tag 0x0112) from a JPEG APP1 segment if present.
function readExifOrientation(buf, segDataStart, segDataEnd) {
  if (segDataEnd - segDataStart < 14) return 1;
  if (
    buf[segDataStart] !== 0x45 || // 'E'
    buf[segDataStart + 1] !== 0x78 || // 'x'
    buf[segDataStart + 2] !== 0x69 || // 'i'
    buf[segDataStart + 3] !== 0x66 || // 'f'
    buf[segDataStart + 4] !== 0x00 ||
    buf[segDataStart + 5] !== 0x00
  ) {
    return 1;
  }
  const tiff = segDataStart + 6;
  const little = buf[tiff] === 0x49 && buf[tiff + 1] === 0x49;
  const big = buf[tiff] === 0x4d && buf[tiff + 1] === 0x4d;
  if (!little && !big) return 1;

  const u16 = (p) => (p + 2 <= segDataEnd ? (little ? buf.readUInt16LE(p) : buf.readUInt16BE(p)) : 0);
  const u32 = (p) => (p + 4 <= segDataEnd ? (little ? buf.readUInt32LE(p) : buf.readUInt32BE(p)) : 0);

  if (u16(tiff + 2) !== 0x002a) return 1;
  const ifdOffset = u32(tiff + 4);
  const ifd = tiff + ifdOffset;
  if (ifd + 2 > segDataEnd) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > segDataEnd) break;
    if (u16(entry) === 0x0112) {
      return u16(entry + 8) || 1;
    }
  }
  return 1;
}

export function imageSize(buf) {
  try {
    // PNG: 8-byte signature, then IHDR chunk with width/height at offset 16.
    if (
      buf.length >= 24 &&
      buf.readUInt32BE(0) === 0x89504e47 &&
      buf.toString('ascii', 12, 16) === 'IHDR'
    ) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }

    // JPEG: walk the marker segments for EXIF orientation (APP1) and Start Of Frame (SOFn).
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let o = 2;
      let orientation = 1;
      while (o < buf.length) {
        if (buf[o] !== 0xff) return null;
        let marker = buf[o + 1];
        while (marker === 0xff) {
          // Fill bytes
          o += 1;
          marker = buf[o + 1];
        }
        o += 2;
        // Standalone markers carry no length field.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          continue;
        }
        if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS: no frame header found
        const length = buf.readUInt16BE(o);
        if (marker === 0xe1 && length >= 16) {
          const parsed = readExifOrientation(buf, o + 2, Math.min(buf.length, o + length));
          if (parsed >= 1 && parsed <= 8) orientation = parsed;
        }
        const isSOF =
          marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) {
          const rawHeight = buf.readUInt16BE(o + 3);
          const rawWidth = buf.readUInt16BE(o + 5);
          // EXIF orientations 5..8 rotate the image 90°/270°, swapping visual width and height.
          return orientation >= 5 && orientation <= 8
            ? { width: rawHeight, height: rawWidth }
            : { width: rawWidth, height: rawHeight };
        }
        o += length;
      }
    }
  } catch {
    // Truncated or malformed file: fall through to null.
  }
  return null;
}

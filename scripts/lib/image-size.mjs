// Reads the pixel dimensions of a PNG or JPEG from its header bytes.
// Used so <img> tags can carry width/height and the gallery doesn't jump
// around while images load. Returns null for anything it can't parse.

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

    // JPEG: walk the marker segments until a Start Of Frame (SOFn) marker.
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let o = 2;
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
        const isSOF =
          marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) {
          return { height: buf.readUInt16BE(o + 3), width: buf.readUInt16BE(o + 5) };
        }
        o += length;
      }
    }
  } catch {
    // Truncated or malformed file: fall through to null.
  }
  return null;
}

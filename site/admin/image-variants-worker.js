// Bundled at build time; AVIF encoding stays off the UI thread. Single-threaded
// WASM deliberately avoids requiring cross-origin isolation on the public site.
import createEncoder from '@jsquash/avif/codec/enc/avif_enc.js';
import { defaultOptions } from '@jsquash/avif/meta.js';
let encoder;
self.onmessage = async ({ data }) => {
  try {
    encoder ||= createEncoder({ locateFile: () => new URL('avif_enc.wasm', self.location.href).href });
    const module = await encoder;
    const output = module.encode(new Uint8Array(data.pixels), data.width, data.height, { ...defaultOptions, quality: 55, speed: 8 });
    if (!output) throw new Error('AVIF encoding failed.');
    const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    self.postMessage({ buffer }, [buffer]);
  } catch (error) { self.postMessage({ error: error.message || 'AVIF encoding failed.' }); }
};

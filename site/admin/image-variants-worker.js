// Bundled locally. Single-threaded codecs avoid cross-origin isolation and
// perform expensive encoding off the UI thread, including on iOS WebKit.
import createAvifEncoder from '@jsquash/avif/codec/enc/avif_enc.js';
import { defaultOptions as avifOptions } from '@jsquash/avif/meta.js';
import createWebpEncoder from '@jsquash/webp/codec/enc/webp_enc.js';
import { defaultOptions as webpOptions } from '@jsquash/webp/meta.js';
let avifEncoder;
let webpEncoder;
self.onmessage = async ({ data }) => {
  try {
    let output;
    if (data.format === 'webp') {
      webpEncoder ||= createWebpEncoder({ locateFile: () => new URL('webp_enc.wasm', self.location.href).href });
      const module = await webpEncoder;
      output = module.encode(new Uint8Array(data.pixels), data.width, data.height, { ...webpOptions, quality: 82 });
    } else {
      avifEncoder ||= createAvifEncoder({ locateFile: () => new URL('avif_enc.wasm', self.location.href).href });
      const module = await avifEncoder;
      output = module.encode(new Uint8Array(data.pixels), data.width, data.height, { ...avifOptions, quality: 55, speed: 8 });
    }
    if (!output) throw new Error('Image encoding failed.');
    const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    self.postMessage({ buffer }, [buffer]);
  } catch (error) { self.postMessage({ error: error.message || 'Image encoding failed.' }); }
};

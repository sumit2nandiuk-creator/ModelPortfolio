import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../site/admin/admin.js', import.meta.url), 'utf8');
function extract(name, next) {
  return source.slice(source.indexOf('  function ' + name + '('), source.indexOf('  function ' + next + '('));
}

test('thumbnail targets capture missing video posters without replacing custom posters', () => {
  const videos = [{ file: 'reel.mp4' }, { file: 'custom.mp4', poster: 'custom.webp' }];
  const context = vm.createContext({ S: { model: { videos } } });
  vm.runInContext(extract('thumbnailTargets', 'resolveThumbnailSource') + ';this.groups = thumbnailTargets();', context);
  const [capture, custom] = context.groups;
  assert.equal(capture.isVideo, true);
  assert.equal(capture.source, 'reel.mp4');
  assert.deepEqual(Array.from(capture.thumbnailRefs, ref => ref.key), ['poster', 'posterThumbnail']);
  assert.equal(custom.source, 'custom.webp');
  assert.equal(custom.isVideo, undefined);
  assert.equal(videos[1].poster, 'custom.webp');
});

test('video frame capture seeks, encodes, and releases the video without playing', async () => {
  let video;
  let drawn;
  const blob = { type: 'image/webp' };
  const context = vm.createContext({
    setTimeout, clearTimeout,
    document: { createElement(tag) {
      if (tag === 'canvas') return { getContext: () => ({ drawImage: (...args) => { drawn = args; } }), toBlob: cb => cb(blob) };
      video = { videoWidth: 1920, videoHeight: 1080, duration: 10,
        pause() {}, removeAttribute() { delete this.src; },
        load() { if (this.src) queueMicrotask(() => { this.onloadedmetadata(); this.onseeked(); }); }
      };
      return video;
    } }
  });
  vm.runInContext(extract('makeVideoThumbnail', 'makeThumbnailFromFile'), context);
  assert.equal(await context.makeVideoThumbnail('blob:video'), blob);
  assert.equal(video.currentTime, 1);
  assert.equal(drawn[3], 360);
  assert.equal(drawn[4], 203);
  assert.equal(video.src, undefined);
  assert.equal(video.onseeked, null);
});

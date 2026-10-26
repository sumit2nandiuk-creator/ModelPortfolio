import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const setup = script.slice(script.indexOf('  function setupVideoPlayer('), script.indexOf('  videoEls.forEach(setupVideoPlayer);'));

test('only an explicit Play click attaches the video source and starts playback', async () => {
  const attrs = new Map([['data-video-src', '/media/reel.mp4']]);
  const events = {};
  let click;
  let loads = 0;
  let plays = 0;
  const button = { hidden: false, addEventListener: (name, handler) => { click = handler; } };
  const video = {
    addEventListener: (name, handler) => { events[name] = handler; },
    closest: () => ({ querySelector: () => button }),
    getAttribute: name => attrs.get(name),
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: name => attrs.delete(name),
    load: () => { loads++; },
    play: () => { plays++; return Promise.resolve(); }
  };
  const context = vm.createContext({ syncVideoOrientation() {}, updateMediaLoaded() {}, videoEls: [video] });
  vm.runInContext(setup, context);
  context.setupVideoPlayer(video);
  assert.equal(loads, 0);
  assert.equal(plays, 0);
  assert.equal(attrs.has('src'), false);
  click();
  assert.equal(attrs.get('src'), '/media/reel.mp4');
  assert.equal(attrs.has('data-video-src'), false);
  assert.equal(loads, 1);
  assert.equal(plays, 1);
  assert.equal(button.hidden, true);
  video.play = () => Promise.reject(new Error('Playback blocked'));
  click();
  await Promise.resolve();
  assert.equal(button.hidden, false, 'failed playback can be retried');
  assert.equal(loads, 1, 'retry does not reset an already attached source');
});

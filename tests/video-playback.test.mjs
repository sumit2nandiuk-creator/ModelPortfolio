import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const setup = script.slice(script.indexOf('  function setupVideoPlayer('), script.indexOf('  videoEls.forEach(setupVideoPlayer);'));

// Minimal video DOM, enough for setupVideoPlayer().
function createHarness({ playback = 'ok' } = {}) {
  const attrs = new Map([['data-video-src', '/media/reel.mp4'], ['aria-label', 'Showreel']]);
  const events = {};
  const frameClasses = new Set();
  let loads = 0;
  let plays = 0;
  const frame = {
    querySelector: () => null,
    classList: { toggle: (name, on) => (on ? frameClasses.add(name) : frameClasses.delete(name)) },
  };
  const video = {
    controls: false,
    addEventListener: (name, handler) => { events[name] = handler; },
    closest: () => frame,
    getAttribute: name => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: name => attrs.delete(name),
    load: () => { loads++; },
    play: () => {
      plays++;
      if (playback === 'reject') return Promise.reject(new Error('Playback blocked'));
      if (playback === 'throw') throw new Error('Playback blocked');
      return Promise.resolve();
    },
  };
  const context = vm.createContext({ syncVideoOrientation() {}, updateMediaLoaded() {}, videoEls: [video] });
  vm.runInContext(setup, context);
  context.setupVideoPlayer(video);
  return {
    attrs,
    events,
    frameClasses,
    video,
    get loads() { return loads; },
    get plays() { return plays; },
    click() { events.click(); },
    key(key) { events.keydown({ key, cancelable: true, preventDefault() {} }); },
  };
}

test('an idle video poster carries no play button, no glyph and no native controls', () => {
  const h = createHarness();
  assert.equal(h.loads, 0);
  assert.equal(h.plays, 0);
  assert.equal(h.attrs.has('src'), false, 'no source is attached while idle');
  assert.equal(h.video.controls, false, 'native controls stay off while idle');
  assert.equal(h.attrs.has('controls'), false);
  assert.equal(h.frameClasses.has('is-playing'), false);
  assert.equal(h.attrs.get('tabindex'), '0', 'the poster stays keyboard reachable');
});

test('tapping the poster attaches the source and starts playback with native controls', () => {
  const h = createHarness();
  h.click();
  assert.equal(h.attrs.get('src'), '/media/reel.mp4');
  assert.equal(h.attrs.has('data-video-src'), false);
  assert.equal(h.loads, 1);
  assert.equal(h.plays, 1);
  assert.equal(h.video.controls, true, 'native controls appear with the playing video');
  assert.equal(h.attrs.has('controls'), true);
  assert.equal(h.frameClasses.has('is-playing'), true);
  assert.equal(h.attrs.has('tabindex'), false, 'native controls own the focus target once playing');

  // Further clicks belong to the native controls: nothing is restarted.
  h.click();
  assert.equal(h.plays, 1);
  assert.equal(h.loads, 1);
});

test('the poster also plays from the keyboard, and only before playback starts', () => {
  const h = createHarness();
  h.key('Tab');
  assert.equal(h.plays, 0, 'other keys are ignored');
  h.key('Enter');
  assert.equal(h.plays, 1);
  assert.equal(h.attrs.get('src'), '/media/reel.mp4');

  h.key(' ');
  assert.equal(h.plays, 1, 'a playing video is not restarted from the keyboard');
});

test('blocked playback restores the playable poster', async () => {
  for (const playback of ['reject', 'throw']) {
    const h = createHarness({ playback });
    h.click();
    await Promise.resolve();
    assert.equal(h.video.controls, false, `${playback}: native controls are removed again`);
    assert.equal(h.attrs.has('controls'), false);
    assert.equal(h.frameClasses.has('is-playing'), false);
    assert.equal(h.attrs.get('data-video-src'), '/media/reel.mp4', `${playback}: the poster can be tapped again`);
    assert.equal(h.attrs.get('tabindex'), '0');

    h.click();
    assert.equal(h.plays, 2, `${playback}: a retry is possible`);
  }
});

test('no round play button is rendered or styled anywhere', async () => {
  const css = await readFile(new URL('../site/assets/site.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.video-play-button/, 'the round play button styles are gone');
  // WebKit's own poster glyphs stay hidden while the frame is idle.
  const guardStart = css.indexOf('.video-frame:not(.is-playing) video::-webkit-media-controls,');
  assert.notEqual(guardStart, -1, 'the idle-poster control guard exists');
  const guard = css.slice(guardStart, css.indexOf('}', guardStart));
  assert.match(guard, /::-webkit-media-controls-start-playback-button/);
  assert.match(guard, /::-webkit-media-controls-overlay-play-button/);
  assert.match(guard, /display:\s*none\s*!important/);
  assert.match(guard, /-webkit-appearance:\s*none/);

  const render = await readFile(new URL('../scripts/lib/render.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(render, /video-play-button/, 'the video card no longer renders a play button');
  assert.doesNotMatch(render, /▶/, 'the video card no longer renders a play glyph');
});

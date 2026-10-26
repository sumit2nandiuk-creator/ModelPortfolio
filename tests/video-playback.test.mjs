import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const setup = script.slice(script.indexOf('  function setupVideoPlayer('), script.indexOf('  videoEls.forEach(setupVideoPlayer);'));

// Minimal video + play-button DOM, enough for setupVideoPlayer().
function createHarness({ playback = 'ok' } = {}) {
  const attrs = new Map([['data-video-src', '/media/reel.mp4']]);
  const events = {};
  const frameClasses = new Set();
  let loads = 0;
  let plays = 0;
  const button = { hidden: false, addEventListener: (name, handler) => { events['button:' + name] = handler; } };
  const video = {
    controls: false,
    addEventListener: (name, handler) => { events[name] = handler; },
    closest: () => ({
      querySelector: () => button,
      classList: { toggle: (name, on) => (on ? frameClasses.add(name) : frameClasses.delete(name)) },
    }),
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
    button,
    video,
    get loads() { return loads; },
    get plays() { return plays; },
    strikePlayButton() { events['button:click'](); },
  };
}

test('the idle poster shows one play button: no native controls until playback starts', () => {
  const h = createHarness();
  assert.equal(h.loads, 0);
  assert.equal(h.plays, 0);
  assert.equal(h.attrs.has('src'), false, 'no source is attached while idle');
  assert.equal(h.video.controls, false, 'native controls stay off while idle, so no second play button');
  assert.equal(h.attrs.has('controls'), false);
  assert.equal(h.frameClasses.has('is-playing'), false);
  assert.equal(h.button.hidden, false, 'the frame keeps its own play button');
});

test('only an explicit Play click attaches the video source, enables controls and starts playback', async () => {
  const h = createHarness();
  h.strikePlayButton();
  assert.equal(h.attrs.get('src'), '/media/reel.mp4');
  assert.equal(h.attrs.has('data-video-src'), false);
  assert.equal(h.loads, 1);
  assert.equal(h.plays, 1);
  assert.equal(h.video.controls, true, 'native controls appear with the playing video');
  assert.equal(h.attrs.has('controls'), true);
  assert.equal(h.frameClasses.has('is-playing'), true);
  assert.equal(h.button.hidden, true);

  // A second click on the (now hidden) button does not re-attach or reload the source.
  h.strikePlayButton();
  assert.equal(h.loads, 1, 'retry does not reset an already attached source');
});

test('blocked playback puts the poster state back, keeping a single play button', async () => {
  for (const playback of ['reject', 'throw']) {
    const h = createHarness({ playback });
    h.strikePlayButton();
    await Promise.resolve();
    assert.equal(h.button.hidden, false, `${playback}: the custom play button comes back for a retry`);
    assert.equal(h.video.controls, false, `${playback}: native controls are removed again`);
    assert.equal(h.attrs.has('controls'), false);
    assert.equal(h.frameClasses.has('is-playing'), false);
  }
});

test('tapping the poster also plays a video that has not been started yet', () => {
  const h = createHarness();
  assert.equal(typeof h.events.click, 'function', 'the video element listens for a tap');
  h.events.click();
  assert.equal(h.plays, 1);
  assert.equal(h.attrs.get('src'), '/media/reel.mp4');
  assert.equal(h.video.controls, true);

  // Once playing, taps belong to the native controls: nothing is restarted.
  h.events.click();
  assert.equal(h.plays, 1);
});

test('CSS hides the WebKit poster play button only while the frame is idle', async () => {
  const css = await readFile(new URL('../site/assets/site.css', import.meta.url), 'utf8');
  const guard = css.slice(css.indexOf('.video-frame:not(.is-playing)'), css.indexOf('}', css.indexOf('.video-frame:not(.is-playing)')));
  assert.match(guard, /::-webkit-media-controls-start-playback-button/, 'iOS start-playback circle is suppressed while idle');
  assert.match(guard, /::-webkit-media-controls-overlay-play-button/, 'WebKit overlay play button is suppressed while idle');
  assert.match(guard, /display:\s*none\s*!important/);
  assert.match(guard, /-webkit-appearance:\s*none/);
  assert.match(css, /\.video-frame:not\(\.is-playing\)/, 'the guard is scoped to an idle frame, so playing videos keep their controls');
  // The play button itself stays a single centred control while idle.
  const block = css.slice(css.indexOf('.video-play-button {'), css.indexOf('.video-play-button[hidden]'));
  assert.match(block, /position:\s*absolute;/);
  assert.match(block, /inset:\s*50% auto auto 50%;/);
  assert.match(block, /border-radius:\s*50%;/);
});

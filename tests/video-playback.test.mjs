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

test('an idle video poster carries no button markup and no native controls', () => {
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

test('the poster carries one white play triangle and no round button', async () => {
  const css = await readFile(new URL('../site/assets/site.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.video-play-button/, 'the old round button styles are gone');

  // The mark on an idle poster: a triangle drawn as an inline SVG, centred, and
  // display-only so the poster underneath stays the tap target.
  const markStart = css.indexOf('.video-frame:not(.is-playing)::after {');
  assert.notEqual(markStart, -1, 'an idle video poster draws a play mark');
  const mark = css.slice(markStart, css.indexOf('}', markStart) + 1);
  assert.match(mark, /content:\s*''/, 'the mark is a CSS pseudo-element, not markup');
  assert.match(mark, /data:image\/svg\+xml/, 'the glyph is an inline SVG triangle');
  assert.match(mark, /%3Cpath%20d='M8%208%20L62%2045%20L8%2082%20Z'/, 'a closed path draws the triangle');
  assert.match(mark, /fill='%23fff'/, 'the triangle is white');
  assert.doesNotMatch(mark, /border-radius|circle/, 'no circle around the glyph');
  assert.match(mark, /position:\s*absolute;/);
  assert.match(mark, /top:\s*50%;/);
  assert.match(mark, /left:\s*50%;/);
  assert.match(mark, /transform:\s*translate\(-50%,\s*-50%\)/, 'the mark sits in the centre');
  assert.match(mark, /pointer-events:\s*none/, 'taps go through to the poster');
  // Sized like a native control-bar glyph: a fixed, small height, never a big overlay.
  assert.match(mark, /height:\s*var\(--video-play-mark,\s*20px\)/, 'the mark uses the control-glyph size');
  assert.match(mark, /width:\s*calc\(var\(--video-play-mark,\s*20px\)\s*\*\s*7\s*\/\s*9\)/, 'the mark keeps its 7:9 shape');
  // Only the two size declarations matter here; translate(-50%, -50%) is centring.
  const widthDecl = mark.match(/\bwidth:\s*([^;]+);/)[1];
  const heightDecl = mark.match(/\bheight:\s*([^;]+);/)[1];
  assert.doesNotMatch(widthDecl, /%|clamp\(/, 'the mark does not scale with the card width');
  assert.doesNotMatch(heightDecl, /%|clamp\(/, 'the mark height is fixed, like a control glyph');
  assert.doesNotMatch(mark, /aspect-ratio/, 'both edges are set from the same size');

  // The size lives on the frame rule, so every card follows one number.
  assert.match(css, /\.video-frame\s*\{[^}]*--video-play-mark:\s*\d+px/);
  const size = css.match(/--video-play-mark:\s*(\d+)px/);
  assert.ok(size, 'the frame defines the mark size');
  const height = Number(size[1]);
  assert.ok(height >= 14 && height <= 24, `the mark stays at control-glyph size, got ${height}px`);

  // It is scoped to an idle frame, so it disappears while the video plays.
  assert.match(css, /\.video-frame\.is-playing\s*\{\s*cursor:\s*default;\s*\}/);
  assert.doesNotMatch(css, /\.video-frame\.is-playing::after/, 'no mark is drawn once playback starts');

  // WebKit's own poster glyphs stay hidden, so only our triangle shows.
  const guardStart = css.indexOf('.video-frame:not(.is-playing) video::-webkit-media-controls,');
  assert.notEqual(guardStart, -1, 'the idle-poster control guard exists');
  const guard = css.slice(guardStart, css.indexOf('}', guardStart));
  assert.match(guard, /::-webkit-media-controls-start-playback-button/);
  assert.match(guard, /::-webkit-media-controls-overlay-play-button/);
  assert.match(guard, /display:\s*none\s*!important/);
  assert.match(guard, /-webkit-appearance:\s*none/);

  // The mark lives in CSS only: the video card markup stays a plain poster.
  const render = await readFile(new URL('../scripts/lib/render.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(render, /video-play-button/, 'the video card renders no play button');
  assert.doesNotMatch(render, /▶/, 'the video card renders no play glyph in its markup');
});

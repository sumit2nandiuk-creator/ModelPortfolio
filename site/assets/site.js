/* Model portfolio – shared behaviour.
   Works on every model page. It reads everything it needs from the DOM,
   so it contains no model-specific data. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Header: solid background after scrolling, mobile menu ------------
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

  function updateHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 40);
  }
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  function setMenu(open) {
    if (!header || !toggle) return;
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      setMenu(!header.classList.contains('is-open'));
    });
  }
  if (nav) {
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });

  // ---- Portfolio category filter -----------------------------------------
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var galleryItems = Array.prototype.slice.call(document.querySelectorAll('.gallery-item'));

  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wanted = btn.getAttribute('data-filter');
      filterButtons.forEach(function (other) {
        var active = other === btn;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-pressed', String(active));
      });
      galleryItems.forEach(function (item) {
        item.hidden = !(wanted === 'all' || item.getAttribute('data-category') === wanted);
      });
    });
  });

  // ---- Lightbox ----------------------------------------------------------
  var dialog = document.getElementById('lightbox');
  if (dialog && typeof dialog.showModal === 'function') {
    var img = document.getElementById('lb-img');
    var caption = document.getElementById('lb-caption');
    var figure = dialog.querySelector('.lb-figure');
    var prev = dialog.querySelector('.lb-prev');
    var next = dialog.querySelector('.lb-next');
    var close = dialog.querySelector('.lb-close');

    // Slow, deliberate timing so the slide is easy to follow.
    var SLIDE_OUT_MS = 520;
    var SLIDE_IN_MS = 680;
    var SNAP_BACK_MS = 440;
    var EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)';

    var list = [];
    var index = 0;
    var busy = false;
    var timers = [];
    var swipe = null;

    function later(ms, fn) {
      timers.push(setTimeout(fn, ms));
    }

    function clearTimers() {
      timers.forEach(clearTimeout);
      timers = [];
    }

    // Moves the photo panel. When `animate` is true it glides over `ms`.
    function place(px, opacity, animate, ms) {
      void figure.offsetWidth; // flush pending styles so the transition starts here
      figure.style.transition = animate
        ? 'transform ' + ms + 'ms ' + EASE + ', opacity ' + ms + 'ms ' + EASE
        : 'none';
      figure.style.transform = 'translate3d(' + px + 'px, 0, 0)';
      figure.style.opacity = String(opacity);
    }

    function currentButtons() {
      return galleryItems
        .filter(function (item) { return !item.hidden; })
        .map(function (item) { return item.querySelector('.gallery-btn'); });
    }

    function showItem(i) {
      var btn = list[i];
      img.src = btn.getAttribute('data-src');
      img.alt = btn.getAttribute('data-alt') || '';
      caption.textContent = btn.getAttribute('data-caption') || '';
      dialog.classList.toggle('is-single', list.length < 2);
    }

    // Runs cb once the new photo has loaded, so the slide never reveals a blank frame.
    function whenImageReady(cb) {
      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        img.removeEventListener('load', finish);
        img.removeEventListener('error', finish);
        cb();
      }
      if (img.complete && img.naturalWidth > 0) {
        finish();
        return;
      }
      img.addEventListener('load', finish);
      img.addEventListener('error', finish);
      later(1500, finish); // never get stuck if an image is slow
    }

    // Slide to the next (delta > 0) or previous (delta < 0) photo.
    function go(delta) {
      if (busy || list.length < 2) return;
      var nextIndex = (index + delta + list.length) % list.length;

      if (reducedMotion) {
        index = nextIndex;
        showItem(index);
        return;
      }

      busy = true;
      var width = window.innerWidth;
      var outX = delta > 0 ? -width : width;

      place(outX, 0, true, SLIDE_OUT_MS);
      later(SLIDE_OUT_MS, function () {
        index = nextIndex;
        showItem(index);
        place(-outX, 0, false, 0); // wait just off-screen on the opposite side
        whenImageReady(function () {
          place(0, 1, true, SLIDE_IN_MS);
          later(SLIDE_IN_MS, function () { busy = false; });
        });
      });
    }

    // Returns the photo to centre when a swipe was too short.
    function snapBack() {
      busy = true;
      place(0, 1, true, SNAP_BACK_MS);
      later(SNAP_BACK_MS, function () { busy = false; });
    }

    function open(btn) {
      clearTimers();
      busy = false;
      // Gallery photos swipe through the visible set; the cover opens on its own.
      list = btn.classList.contains('gallery-btn') ? currentButtons() : [btn];
      index = Math.max(0, list.indexOf(btn));
      showItem(index);
      place(0, 1, false, 0);
      dialog.showModal();
      close.focus({ preventScroll: true });
    }

    galleryItems.forEach(function (item) {
      var btn = item.querySelector('.gallery-btn');
      if (btn) btn.addEventListener('click', function () { open(btn); });
    });

    var heroOpen = document.querySelector('.hero-open');
    if (heroOpen) heroOpen.addEventListener('click', function () { open(heroOpen); });

    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    close.addEventListener('click', function () { dialog.close(); });

    // Click on the dark backdrop (outside the image) closes the viewer.
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target.classList.contains('lb-inner') || e.target.classList.contains('lb-figure')) {
        dialog.close();
      }
    });

    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });

    // ---- Swipe: the photo follows the finger, then glides to the next one.
    dialog.addEventListener('touchstart', function (e) {
      if (busy || list.length < 2 || e.touches.length !== 1) {
        swipe = null;
        return;
      }
      var t = e.touches[0];
      swipe = { x: t.clientX, y: t.clientY, time: Date.now(), dx: 0, axis: null };
    }, { passive: true });

    dialog.addEventListener('touchmove', function (e) {
      if (!swipe || e.touches.length !== 1) return;
      var t = e.touches[0];
      var dx = t.clientX - swipe.x;
      var dy = t.clientY - swipe.y;

      if (swipe.axis === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; // wait until the gesture is clear
        swipe.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (swipe.axis === 'x') figure.style.transition = 'none';
      }
      if (swipe.axis !== 'x') return; // vertical movement is ignored

      e.preventDefault();
      swipe.dx = dx;
      figure.style.transform = 'translate3d(' + dx + 'px, 0, 0)';
      figure.style.opacity = String(1 - 0.5 * Math.min(1, Math.abs(dx) / window.innerWidth));
    }, { passive: false });

    dialog.addEventListener('touchend', function () {
      var s = swipe;
      swipe = null;
      if (!s || s.axis !== 'x') return;

      var distance = Math.abs(s.dx);
      var speed = distance / Math.max(1, Date.now() - s.time); // px per ms
      var commit = distance > window.innerWidth * 0.22 || (distance > 40 && speed > 0.45);
      if (commit) go(s.dx < 0 ? 1 : -1);
      else snapBack();
    });

    dialog.addEventListener('touchcancel', function () {
      var s = swipe;
      swipe = null;
      if (s && s.axis === 'x') snapBack();
    });

    dialog.addEventListener('close', function () {
      clearTimers();
      busy = false;
      swipe = null;
      img.removeAttribute('src');
      img.alt = '';
      figure.style.transition = 'none';
      figure.style.transform = '';
      figure.style.opacity = '';
    });
  }

  // ---- Reveal on scroll ----------------------------------------------------
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window && !reducedMotion) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { observer.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }
})();

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

  // ---- Carousel ------------------------------------------------------------
  // Slides sit side by side. While you drag, the slide under your finger moves
  // with it, and the neighbour on that side is already in place, so it comes
  // along. Slides wrap around, so the first and last photo are neighbours.
  var SLIDE_MS = 520;
  var SNAP_BACK_MS = 440;
  var EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)';

  function createCarousel(root, options) {
    options = options || {};
    var index = 0;
    var dx = 0;          // live drag offset in px
    var busy = false;    // true while a slide is animating
    var drag = null;     // gesture in progress
    var suppressUntil = 0; // clicks before this time came from the end of a drag
    var timers = [];
    var autoTimer = null;

    function slides() {
      return Array.prototype.slice.call(root.querySelectorAll('.carousel-slide'));
    }

    function width() {
      return root.clientWidth || window.innerWidth;
    }

    function later(ms, fn) {
      timers.push(setTimeout(fn, ms));
    }

    function stopAutoplay() {
      clearTimeout(autoTimer);
      autoTimer = null;
    }

    function restartAutoplay() {
      stopAutoplay();
      if (!options.autoplay || reducedMotion || slides().length < 2) return;
      autoTimer = setTimeout(function () { step(1); }, options.autoplay);
    }

    // Puts every slide where it belongs for the current index and drag offset.
    function place(animate, ms) {
      var els = slides();
      var n = els.length;
      var w = width();
      els.forEach(function (el, i) {
        var d = (i - index + n) % n;
        if (d > n / 2) d -= n;                              // nearest way round
        if (n === 2 && i !== index) d = dx < 0 ? 1 : -1;    // one neighbour: show it on the side being dragged
        el.style.transition = animate ? 'transform ' + ms + 'ms ' + EASE : 'none';
        el.style.transform = 'translate3d(' + (d * w + dx) + 'px, 0, 0)';
        el.classList.toggle('is-current', i === index);
        el.inert = i !== index;
      });
      void root.offsetWidth; // apply the starting position before any transition runs
    }

    function notify() {
      if (options.onChange) options.onChange(index);
    }

    function goTo(next, animate) {
      var n = slides().length;
      if (n < 2) return;
      index = ((next % n) + n) % n;
      dx = 0;
      busy = !!animate;
      place(animate, SLIDE_MS);
      if (animate) later(SLIDE_MS, function () { busy = false; });
      notify();
      restartAutoplay();
    }

    function step(delta) {
      goTo(index + delta, !reducedMotion);
    }

    function snapBack() {
      dx = 0;
      busy = !reducedMotion; // only lock input while the slide is actually sliding back
      place(!reducedMotion, SNAP_BACK_MS);
      if (busy) later(SNAP_BACK_MS, function () { busy = false; });
    }

    function cancel() {
      timers.forEach(clearTimeout);
      timers = [];
      busy = false;
      drag = null;
      dx = 0;
      suppressUntil = 0;
      stopAutoplay();
    }

    root.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      suppressUntil = 0;
      if (busy || slides().length < 2) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), axis: null };
      stopAutoplay();
    });

    root.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var moveX = e.clientX - drag.x;
      var moveY = e.clientY - drag.y;
      if (drag.axis === null) {
        if (Math.abs(moveX) < 6 && Math.abs(moveY) < 6) return; // wait until the direction is clear
        drag.axis = Math.abs(moveX) > Math.abs(moveY) ? 'x' : 'y';
        if (drag.axis === 'x' && root.setPointerCapture) {
          try { root.setPointerCapture(e.pointerId); } catch (err) { /* keep going without capture */ }
        }
      }
      if (drag.axis !== 'x') return; // vertical movement scrolls the page instead
      dx = moveX;
      place(false, 0);
    });

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var finished = drag;
      drag = null;
      if (finished.axis !== 'x') {
        restartAutoplay();
        return;
      }
      suppressUntil = Date.now() + 350; // a drag is not a tap; the click that follows it is ignored
      var distance = Math.abs(dx);
      var speed = distance / Math.max(1, Date.now() - finished.t); // px per ms
      var commit = distance > width() * 0.22 || (distance > 40 && speed > 0.45);
      if (commit) goTo(index + (dx < 0 ? 1 : -1), !reducedMotion);
      else snapBack();
    }
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);

    // After a drag, swallow the click so the slide does not also open the viewer.
    root.addEventListener('click', function (e) {
      if (Date.now() > suppressUntil) return;
      suppressUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    return {
      goTo: function (i) { goTo(i, !reducedMotion); },
      step: step,
      current: function () { return index; },
      reset: function (i) {
        var n = slides().length || 1;
        cancel();
        index = ((i % n) + n) % n;
        place(false, 0);
        notify();
      },
      cancel: cancel,
      pause: stopAutoplay,
      resume: restartAutoplay,
    };
  }

  // ---- Cover slideshow -----------------------------------------------------
  var heroSection = document.querySelector('.hero');
  var heroRoot = heroSection ? heroSection.querySelector('.carousel') : null;
  var heroDots = heroSection
    ? Array.prototype.slice.call(heroSection.querySelectorAll('.carousel-dot'))
    : [];
  var hero = null;

  if (heroRoot) {
    hero = createCarousel(heroRoot, {
      autoplay: Number(heroRoot.getAttribute('data-autoplay')) || 0,
      onChange: function (i) {
        heroDots.forEach(function (dot, j) { dot.classList.toggle('is-active', j === i); });
      },
    });
    heroDots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        hero.goTo(Number(dot.getAttribute('data-goto')));
      });
    });
    hero.reset(0);
    hero.resume();
  }

  // ---- Photo viewer --------------------------------------------------------
  var dialog = document.getElementById('lightbox');
  var stage = document.getElementById('lb-stage');
  if (dialog && stage && typeof dialog.showModal === 'function') {
    var caption = document.getElementById('lb-caption');
    var closeBtn = dialog.querySelector('.lb-close');
    var prevBtn = dialog.querySelector('.lb-prev');
    var nextBtn = dialog.querySelector('.lb-next');
    var items = [];

    function readItem(btn) {
      return {
        src: btn.getAttribute('data-src'),
        alt: btn.getAttribute('data-alt') || '',
        caption: btn.getAttribute('data-caption') || '',
      };
    }

    // Loads the photo on screen and its two neighbours; the rest load when reached.
    function loadAround(i) {
      var els = stage.querySelectorAll('.carousel-slide');
      var n = items.length;
      [-1, 0, 1].forEach(function (d) {
        var j = (i + d + n) % n;
        var img = els[j] && els[j].querySelector('img');
        if (img && !img.getAttribute('src')) img.setAttribute('src', items[j].src);
      });
    }

    function showCaption(i) {
      var text = items[i] ? items[i].caption : '';
      caption.textContent = text;
      caption.hidden = !text;
    }

    var viewer = createCarousel(stage, {
      onChange: function (i) {
        loadAround(i);
        showCaption(i);
      },
    });

    function open(list, start) {
      items = list;
      stage.textContent = '';
      list.forEach(function (item) {
        var figure = document.createElement('figure');
        figure.className = 'carousel-slide';
        var img = document.createElement('img');
        img.alt = item.alt;
        img.decoding = 'async';
        img.draggable = false;
        figure.appendChild(img);
        stage.appendChild(figure);
      });
      dialog.classList.toggle('is-single', list.length < 2);
      if (hero) hero.pause();
      viewer.reset(start);
      dialog.showModal();
      closeBtn.focus({ preventScroll: true });
    }

    // The gallery photos currently shown (the category filter may hide some).
    function currentButtons() {
      return galleryItems
        .filter(function (item) { return !item.hidden; })
        .map(function (item) { return item.querySelector('.gallery-btn'); });
    }

    function openGallery(btn) {
      var buttons = currentButtons();
      open(buttons.map(readItem), Math.max(0, buttons.indexOf(btn)));
    }

    galleryItems.forEach(function (item) {
      var btn = item.querySelector('.gallery-btn');
      if (btn) btn.addEventListener('click', function () { openGallery(btn); });
    });

    if (heroRoot) {
      heroRoot.addEventListener('click', function (e) {
        var slide = e.target.closest ? e.target.closest('.carousel-slide') : null;
        if (!slide) return;
        var slides = Array.prototype.slice.call(heroRoot.querySelectorAll('.carousel-slide'));
        open(slides.map(readItem), Math.max(0, slides.indexOf(slide)));
      });
    }

    prevBtn.addEventListener('click', function () { viewer.step(-1); });
    nextBtn.addEventListener('click', function () { viewer.step(1); });
    closeBtn.addEventListener('click', function () { dialog.close(); });

    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); viewer.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); viewer.step(1); }
    });

    // A click on the dark area around the photo closes the viewer.
    function outsidePhoto(e) {
      var slide = e.target.closest ? e.target.closest('.carousel-slide') : null;
      var img = slide && slide.querySelector('img');
      if (!img) return false;
      var r = img.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    }
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target === stage || e.target.classList.contains('lb-inner') || outsidePhoto(e)) {
        dialog.close();
      }
    });

    dialog.addEventListener('close', function () {
      viewer.cancel();
      stage.textContent = '';
      if (hero) hero.resume();
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

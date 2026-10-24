/* Model portfolio – shared behaviour.
   Works on every model page. It reads everything it needs from the DOM,
   so it contains no model-specific data. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Photos and videos: block the easy ways to save them -----------------
  // No right-click or long-press menu on media, and no native drag. This stops
  // casual saving. It is not real protection: the browser can still load the files.
  var MEDIA_SELECTOR = 'img, video, .carousel, .lightbox';
  document.addEventListener('contextmenu', function (e) {
    if (e.target.closest && e.target.closest(MEDIA_SELECTOR)) e.preventDefault();
  });
  document.addEventListener('dragstart', function (e) {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO') e.preventDefault();
  });

  // ---- Header: solid background after scrolling, mobile menu ------------
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

  function updateHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 40);
  }
  updateHeader();

  // The WhatsApp button fades in once the visitor has scrolled past the cover.
  var whatsapp = document.querySelector('.whatsapp-float');
  function updateWhatsApp() {
    if (whatsapp) whatsapp.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.7);
  }
  if (whatsapp) {
    updateWhatsApp();
    window.addEventListener('scroll', updateWhatsApp, { passive: true });
  }
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
  var SLIDE_MS = 380;
  var SNAP_BACK_MS = 300;
  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  var requestFrame = window.requestAnimationFrame
    ? function (fn) { return window.requestAnimationFrame(fn); }
    : function (fn) { return setTimeout(fn, 16); };
  var cancelFrame = window.cancelAnimationFrame
    ? function (id) { window.cancelAnimationFrame(id); }
    : function (id) { clearTimeout(id); };

  function createCarousel(root, options) {
    options = options || {};
    var gestureEl = options.gestureTarget || root;
    var allowVerticalScroll = options.verticalScroll !== false;
    var index = 0;
    var dx = 0;            // live drag offset in px
    var lastSide = -1;     // which side a single neighbour sits on (-1 left, +1 right)
    var busy = false;      // true while a slide is animating
    var drag = null;       // gesture in progress
    var suppressUntil = 0; // clicks before this time came from the end of a drag
    var timers = [];
    var autoTimer = null;
    var frame = 0;         // pending animation frame for drag updates

    function slides() {
      return Array.prototype.slice.call(root.querySelectorAll('.carousel-slide'));
    }

    function width() {
      var rect = root.getBoundingClientRect ? root.getBoundingClientRect() : null;
      return (rect && rect.width) || root.clientWidth || window.innerWidth;
    }

    function clearTimers() {
      timers.forEach(clearTimeout);
      timers = [];
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

    function slotFor(i, n, side) {
      if (i === index) return 0;
      if (n === 2) return side;
      var d = (i - index + n) % n;
      if (d > n / 2) d -= n; // nearest way round
      return d;
    }

    // Sets where each slide sits for the current index and drag offset.
    // Only the photo on screen and its two neighbours are painted. The others are
    // hidden, so the browser holds only a few large photos in memory while swiping.
    function layout(animate, ms) {
      var els = slides();
      var n = els.length;
      var w = width();
      var side = dx < 0 ? 1 : dx > 0 ? -1 : lastSide;
      if (dx !== 0) lastSide = side;
      els.forEach(function (el, i) {
        var d = slotFor(i, n, side);
        var near = Math.abs(d) <= 1;
        el.style.transition = animate && near ? 'transform ' + ms + 'ms ' + EASE : 'none';
        el.style.transform = 'translate3d(' + (d * w + dx) + 'px, 0, 0)';
        el.style.visibility = near ? 'visible' : 'hidden';
        el.style.willChange = near ? 'transform' : 'auto';
        el.classList.toggle('is-current', i === index);
        el.inert = i !== index;
        if (near) {
          var img = el.querySelector('img');
          if (img && img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
        }
      });
    }

    // Decode the photos that are about to come on screen, so none of them flashes blank.
    function predecode() {
      slides().forEach(function (el) {
        var img = el.querySelector('img');
        if (img && img.decode && img.getAttribute('src')) img.decode().catch(function () { /* not ready yet */ });
      });
    }

    // Drag moves are applied at most once per animation frame.
    function scheduleLayout() {
      if (frame) return;
      frame = requestFrame(function () {
        frame = 0;
        layout(false, 0);
      });
    }

    function cancelScheduled() {
      if (frame) cancelFrame(frame);
      frame = 0;
    }

    function settleNow() {
      cancelScheduled();
      clearTimers();
      busy = false;
      dx = 0;
      layout(false, 0);
    }

    function notify() {
      if (options.onChange) options.onChange(index);
    }

    // Moves to `next`. `dirHint` is +1 when advancing (right-to-left swipe) and
    // -1 when going back (left-to-right swipe), so the outgoing and incoming slides
    // always continue in the direction of the swipe without wrapping across the screen.
    function goTo(next, animate, dirHint) {
      var els = slides();
      var n = els.length;
      if (n < 2) return;
      cancelScheduled();
      clearTimers();

      var prevIndex = index;
      var nextIndex = ((next % n) + n) % n;
      if (nextIndex === prevIndex) {
        if (dx !== 0) snapBack();
        return;
      }

      var dir = dirHint;
      if (!dir) {
        if (dx !== 0) {
          dir = dx < 0 ? 1 : -1;
        } else {
          var diff = (nextIndex - prevIndex + n) % n;
          if (diff > n / 2) diff -= n;
          dir = diff >= 0 ? 1 : -1;
        }
      }

      var w = width();
      var startOffset = dx;
      index = nextIndex;
      dx = 0;
      lastSide = -dir;

      notify();
      predecode();

      if (!animate) {
        busy = false;
        layout(false, 0);
        restartAutoplay();
        return;
      }

      // Place the outgoing and incoming slides at their exact starting positions without
      // transition, and park all other slides out of sight so wrapping never crosses the screen.
      busy = true;
      els.forEach(function (el, i) {
        el.style.transition = 'none';
        el.classList.toggle('is-current', i === index);
        el.inert = i !== index;
        if (i === prevIndex) {
          el.style.transform = 'translate3d(' + startOffset + 'px, 0, 0)';
          el.style.visibility = 'visible';
          el.style.willChange = 'transform';
        } else if (i === index) {
          el.style.transform = 'translate3d(' + (dir * w + startOffset) + 'px, 0, 0)';
          el.style.visibility = 'visible';
          el.style.willChange = 'transform';
          var img = el.querySelector('img');
          if (img && img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
        } else {
          var d = slotFor(i, n, lastSide);
          el.style.transform = 'translate3d(' + (d * w) + 'px, 0, 0)';
          el.style.visibility = 'hidden';
          el.style.willChange = 'auto';
        }
      });

      void root.offsetWidth; // commit starting positions before animating
      var prevEl = els[prevIndex];
      var currEl = els[index];
      if (prevEl) {
        prevEl.style.transition = 'transform ' + SLIDE_MS + 'ms ' + EASE;
        prevEl.style.transform = 'translate3d(' + (-dir * w) + 'px, 0, 0)';
      }
      if (currEl) {
        currEl.style.transition = 'transform ' + SLIDE_MS + 'ms ' + EASE;
        currEl.style.transform = 'translate3d(0px, 0, 0)';
      }

      later(SLIDE_MS, function () {
        busy = false;
        layout(false, 0);
      });
      restartAutoplay();
    }

    function step(delta) {
      goTo(index + delta, !reducedMotion, delta < 0 ? -1 : 1);
    }

    function snapBack() {
      if (frame) {
        cancelScheduled();
        layout(false, 0);
      }
      clearTimers();
      dx = 0;
      busy = !reducedMotion; // only lock input while the slide is actually sliding back
      if (busy) void root.offsetWidth;
      layout(!reducedMotion, SNAP_BACK_MS);
      if (busy) later(SNAP_BACK_MS, function () { busy = false; });
      restartAutoplay();
    }

    function cancel() {
      cancelScheduled();
      clearTimers();
      busy = false;
      drag = null;
      dx = 0;
      suppressUntil = 0;
      stopAutoplay();
    }

    // Inside the fullscreen viewer there is no page scroll, so prevent browser
    // rubber-banding during active single-finger horizontal swipes.
    if (!allowVerticalScroll) {
      gestureEl.addEventListener('touchmove', function (e) {
        if (!drag || (e.touches && e.touches.length > 1)) return;
        if (drag.axis === 'x' && e.cancelable) e.preventDefault();
      }, { passive: false });
    }

    gestureEl.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.isPrimary === false) return; // ignore secondary multi-touch fingers
      if (e.target && e.target.closest && e.target.closest('.lb-close')) return;
      if (slides().length < 2) return;

      var onControl = !!(e.target && e.target.closest && e.target.closest('.lb-btn'));
      var caughtMidSlide = busy && !onControl;
      if ((busy || dx !== 0) && !onControl) {
        settleNow();
      }

      var now = Date.now();
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastT: now,
        vx: 0,
        axis: null,
        moved: false,
        caughtMidSlide: caughtMidSlide,
      };
      stopAutoplay();
    });

    gestureEl.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var moveX = e.clientX - drag.x;
      var moveY = e.clientY - drag.y;
      if (Math.abs(moveX) >= 6 || Math.abs(moveY) >= 6) drag.moved = true;

      if (drag.axis === null) {
        if (Math.abs(moveX) < 6 && Math.abs(moveY) < 6) return; // wait until the direction is clear
        if (allowVerticalScroll) {
          drag.axis = Math.abs(moveX) >= Math.abs(moveY) ? 'x' : 'y';
        } else {
          // In the fullscreen popup there is nothing to scroll vertically, so never
          // lock out horizontal swipes if the thumb starts at a slight vertical angle.
          if (Math.abs(moveX) < 6) return;
          drag.axis = 'x';
        }
        if (drag.axis === 'x') {
          if (busy) settleNow();
          if (gestureEl.setPointerCapture) {
            try { gestureEl.setPointerCapture(e.pointerId); } catch (err) { /* keep going without capture */ }
          }
        }
      }
      if (drag.axis !== 'x') return; // vertical movement scrolls the page instead

      var now = Date.now();
      var dt = now - drag.lastT;
      if (dt > 0) {
        var instantVx = (e.clientX - drag.lastX) / dt;
        drag.vx = drag.vx ? drag.vx * 0.4 + instantVx * 0.6 : instantVx;
        drag.lastX = e.clientX;
        drag.lastT = now;
      }

      var w = width();
      dx = Math.max(-w, Math.min(w, moveX));
      scheduleLayout();
    });

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var finished = drag;
      drag = null;

      if (finished.axis !== 'x') {
        if (finished.moved || finished.caughtMidSlide) {
          suppressUntil = Date.now() + 350;
        }
        restartAutoplay();
        return;
      }

      suppressUntil = Date.now() + 350; // a drag is not a tap; the click that follows it is ignored
      if (e.type !== 'pointerup') {
        if (dx !== 0) snapBack();
        else restartAutoplay();
        return;
      }

      var distance = Math.abs(dx);
      var recentVx = Date.now() - finished.lastT > 100 ? 0 : finished.vx;
      var flickForward = distance > 24 && recentVx * dx > 0 && Math.abs(recentVx) > 0.3;
      var flickBack = recentVx * dx < 0 && Math.abs(recentVx) > 0.3;
      var commit = !flickBack && (distance > width() * 0.18 || flickForward);
      if (commit) {
        var delta = dx < 0 ? 1 : -1;
        goTo(index + delta, !reducedMotion, delta);
      } else {
        snapBack();
      }
    }
    gestureEl.addEventListener('pointerup', endDrag);
    gestureEl.addEventListener('pointercancel', endDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // Stop the browser from starting a native image drag, which would cancel the swipe.
    gestureEl.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // After a drag, swallow the click so the slide does not also open or close the viewer.
    gestureEl.addEventListener('click', function (e) {
      if (Date.now() > suppressUntil) return;
      suppressUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    // Recalculate slide positions after the screen size changes (rotation, address bar,
    // split view). Skipped mid-gesture or mid-slide; the next move lays them out anyway.
    function relayout() {
      if (drag || busy) return;
      layout(false, 0);
    }

    return {
      relayout: relayout,
      goTo: function (i) { goTo(i, !reducedMotion); },
      step: step,
      current: function () { return index; },
      reset: function (i) {
        var n = slides().length || 1;
        cancel();
        index = ((i % n) + n) % n;
        lastSide = -1;
        notify();
        layout(false, 0);
        predecode();
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
  var viewerCarousel = null; // the photo viewer's carousel; set below when the viewer exists

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

  // Keep the cover slides aligned with the real screen width. Without this, a size change
  // after load leaves the neighbouring photos partly visible at the edges.
  var resizeTimer = null;
  function relayoutCarousels() {
    if (hero) hero.relayout();
    if (viewerCarousel) viewerCarousel.relayout();
  }
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayoutCarousels, 60);
  }, { passive: true });
  window.addEventListener('orientationchange', relayoutCarousels);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', relayoutCarousels);

  // ---- Photo viewer --------------------------------------------------------
  var dialog = document.getElementById('lightbox');
  var stage = document.getElementById('lb-stage');
  if (dialog && stage && typeof dialog.showModal === 'function') {
    var lbInner = dialog.querySelector('.lb-inner') || stage;
    var caption = document.getElementById('lb-caption');
    var closeBtn = dialog.querySelector('.lb-close');
    var prevBtn = dialog.querySelector('.lb-prev');
    var nextBtn = dialog.querySelector('.lb-next');
    var items = [];
    var dialogDown = null;

    function readItem(btn) {
      return {
        src: btn.getAttribute('data-src'),
        alt: btn.getAttribute('data-alt') || '',
        caption: btn.getAttribute('data-caption') || '',
      };
    }

    // Loads the photo on screen and its neighbours on both sides so swiping
    // left-to-right or right-to-left never meets an unloaded slide.
    function loadAround(i) {
      var els = stage.querySelectorAll('.carousel-slide');
      var n = items.length;
      if (!n) return;
      [0, -1, 1, -2, 2].forEach(function (d) {
        var j = ((i + d) % n + n) % n;
        var img = els[j] && els[j].querySelector('img');
        if (img && !img.getAttribute('src')) {
          img.setAttribute('src', items[j].src);
          if (img.decode) img.decode().catch(function () { /* not ready yet */ });
        }
      });
    }

    function showCaption(i) {
      var text = items[i] ? items[i].caption : '';
      caption.textContent = text;
      caption.hidden = !text;
    }

    viewerCarousel = createCarousel(stage, {
      gestureTarget: lbInner,
      verticalScroll: false,
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
      if (!dialog.open) dialog.showModal();
      viewerCarousel.reset(start);
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

    prevBtn.addEventListener('click', function () { viewerCarousel.step(-1); });
    nextBtn.addEventListener('click', function () { viewerCarousel.step(1); });
    closeBtn.addEventListener('click', function () { dialog.close(); });

    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); viewerCarousel.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); viewerCarousel.step(1); }
    });

    // The part of the screen the photo actually covers (the photo is letterboxed to fit).
    function photoBox(img) {
      var box = img.getBoundingClientRect();
      if (!img.naturalWidth || !img.naturalHeight || !box.width || !box.height) return null;
      var scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
      var w = img.naturalWidth * scale;
      var h = img.naturalHeight * scale;
      var left = box.left + (box.width - w) / 2;
      var top = box.top + (box.height - h) / 2;
      return { left: left, top: top, right: left + w, bottom: top + h };
    }

    // A click on the dark area around the photo closes the viewer, unless the finger moved.
    function outsidePhoto(e) {
      var slide = e.target.closest ? e.target.closest('.carousel-slide') : null;
      var img = slide && slide.querySelector('img');
      var r = img && photoBox(img);
      if (!r) return false;
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    }
    dialog.addEventListener('pointerdown', function (e) {
      dialogDown = { x: e.clientX, y: e.clientY };
    });
    dialog.addEventListener('click', function (e) {
      if (dialogDown && (Math.abs(e.clientX - dialogDown.x) >= 8 || Math.abs(e.clientY - dialogDown.y) >= 8)) {
        dialogDown = null;
        return;
      }
      dialogDown = null;
      if (e.target === dialog || e.target === stage || e.target.classList.contains('lb-inner') || outsidePhoto(e)) {
        dialog.close();
      }
    });

    dialog.addEventListener('close', function () {
      dialogDown = null;
      viewerCarousel.cancel();
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

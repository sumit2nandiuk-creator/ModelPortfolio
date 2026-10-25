/* Model portfolio – shared behaviour.
   Works on every model page. It reads everything it needs from the DOM,
   so it contains no model-specific data. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Always open / refresh at the top of the page ------------------------
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  function scrollToTopInstant() {
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = prev;
  }

  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  scrollToTopInstant();

  var userInteracted = false;
  function markInteracted() {
    userInteracted = true;
  }
  window.addEventListener('wheel', markInteracted, { passive: true, once: true });
  window.addEventListener('touchstart', markInteracted, { passive: true, once: true });
  window.addEventListener('pointerdown', markInteracted, { passive: true, once: true });
  window.addEventListener('keydown', markInteracted, { passive: true, once: true });

  // ---- Photos and videos: block the easy ways to save them -----------------
  // No right-click or long-press menu on media, and no native drag. This stops
  // casual saving. It is not real protection: the browser can still load the files.
  var MEDIA_SELECTOR = 'img, video, .carousel, .lightbox';
  document.addEventListener('contextmenu', function (e) {
    if (e.target.closest && e.target.closest(MEDIA_SELECTOR)) e.preventDefault();
  });
  document.addEventListener('dragstart', function (e) {
    if (
      e.target.tagName === 'IMG' ||
      e.target.tagName === 'VIDEO' ||
      (e.target.closest && e.target.closest('.whatsapp-float'))
    ) {
      e.preventDefault();
    }
  });

  // ---- Header: solid background after scrolling, mobile menu ------------
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  var heroSection = document.querySelector('.hero');

  function updateHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 40);
  }
  updateHeader();

  // The WhatsApp button fades in once the visitor has scrolled past the cover.
  // Measure against the cover height (100svh) with hysteresis so mobile toolbar
  // expand/collapse on touch never hides the button mid-tap.
  var whatsapp = document.querySelector('.whatsapp-float');
  var whatsappVisible = false;
  function updateWhatsApp() {
    if (!whatsapp) return;
    var refHeight = (heroSection && heroSection.offsetHeight) || window.innerHeight;
    var showAt = refHeight * 0.7;
    var hideBelow = refHeight * 0.58;
    if (!whatsappVisible && window.scrollY > showAt) {
      whatsappVisible = true;
    } else if (whatsappVisible && window.scrollY < hideBelow) {
      whatsappVisible = false;
    }
    whatsapp.classList.toggle('is-visible', whatsappVisible);
  }
  if (whatsapp) {
    updateWhatsApp();
    window.addEventListener('scroll', updateWhatsApp, { passive: true });
  }
  window.addEventListener('scroll', updateHeader, { passive: true });

  window.addEventListener('load', function () {
    if (!userInteracted && window.scrollY > 0) {
      scrollToTopInstant();
      updateHeader();
      updateWhatsApp();
    }
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted || (!userInteracted && window.scrollY > 0)) {
      scrollToTopInstant();
      updateHeader();
      updateWhatsApp();
    }
  });

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
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;
    var hash = link.getAttribute('href');
    if (!hash || hash === '#') return;
    var target = document.getElementById(hash.slice(1));
    if (!target) return;
    e.preventDefault();
    setMenu(false);
    if (hash === '#top') {
      window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    } else {
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      if (hash === '#main') {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  });
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

  var requestFrame = window.requestAnimationFrame
    ? function (fn) { return window.requestAnimationFrame(fn); }
    : function (fn) { return setTimeout(fn, 16); };
  var cancelFrame = window.cancelAnimationFrame
    ? function (id) { window.cancelAnimationFrame(id); }
    : function (id) { clearTimeout(id); };

  function createCarousel(root, options) {
    options = options || {};
    var index = 0;
    var dx = 0;            // live drag offset in px
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

    // Sets where each slide sits for the current index and drag offset.
    // Only the photo on screen and its two neighbours are painted. The others are
    // hidden, so the browser holds only a few large photos in memory while swiping.
    function layout(animate, ms) {
      var els = slides();
      var n = els.length;
      var w = width();
      els.forEach(function (el, i) {
        var d = (i - index + n) % n;
        if (d > n / 2) d -= n;                              // nearest way round
        if (n === 2 && i !== index) d = dx < 0 ? 1 : -1;    // one neighbour: show it on the side being dragged
        var near = Math.abs(d) <= 1;
        el.style.transition = animate ? 'transform ' + ms + 'ms ' + EASE : 'none';
        el.style.transform = 'translate3d(' + (d * w + dx) + 'px, 0, 0)';
        el.style.visibility = near ? 'visible' : 'hidden';
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

    function notify() {
      if (options.onChange) options.onChange(index);
    }

    function goTo(next, animate) {
      var n = slides().length;
      if (n < 2) return;
      cancelScheduled();
      index = ((next % n) + n) % n;
      dx = 0;
      busy = !!animate;
      if (animate) void root.offsetWidth; // start the slide from where the drag left it
      layout(animate, SLIDE_MS);
      predecode();
      if (animate) later(SLIDE_MS, function () { busy = false; });
      notify();
      restartAutoplay();
    }

    function step(delta) {
      goTo(index + delta, !reducedMotion);
    }

    function snapBack() {
      cancelScheduled();
      dx = 0;
      busy = !reducedMotion; // only lock input while the slide is actually sliding back
      if (busy) void root.offsetWidth;
      layout(!reducedMotion, SNAP_BACK_MS);
      if (busy) later(SNAP_BACK_MS, function () { busy = false; });
    }

    function cancel() {
      cancelScheduled();
      timers.forEach(clearTimeout);
      timers = [];
      busy = false;
      drag = null;
      dx = 0;
      suppressUntil = 0;
      stopAutoplay();
    }

    function abortDrag() {
      if (!drag) return;
      cancelScheduled();
      drag = null;
      if (dx !== 0) {
        dx = 0;
        layout(false, 0);
      }
      restartAutoplay();
    }

    root.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      suppressUntil = 0;
      if (options.canDrag && !options.canDrag()) return;
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
      scheduleLayout();
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

    // Stop the browser from starting a native image drag, which would cancel the swipe.
    root.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // After a drag, swallow the click so the slide does not also open the viewer.
    root.addEventListener('click', function (e) {
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
        layout(false, 0);
        predecode();
        notify();
      },
      cancel: cancel,
      abortDrag: abortDrag,
      pause: stopAutoplay,
      resume: restartAutoplay,
    };
  }

  // ---- Cover slideshow -----------------------------------------------------
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
    updateWhatsApp();
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
    var caption = document.getElementById('lb-caption');
    var closeBtn = dialog.querySelector('.lb-close');
    var prevBtn = dialog.querySelector('.lb-prev');
    var nextBtn = dialog.querySelector('.lb-next');
    var items = [];

    // Touch zoom state for the active popup photo (pinch-to-zoom, 1-finger pan while zoomed,
    // and double-tap to zoom in / reset). When zoomScale === 1, single-finger horizontal
    // swipe stays on the carousel untouched.
    var MAX_ZOOM = 4;
    var DOUBLE_TAP_ZOOM = 2.5;
    var ZOOM_MS = 220;
    var zoomScale = 1;
    var zoomX = 0;
    var zoomY = 0;
    var pinch = null;
    var pan = null;
    var tapCandidate = null;
    var lastTap = null;
    var suppressCloseUntil = 0;
    var zoomAnimTimer = null;

    function currentImg() {
      var idx = viewerCarousel ? viewerCarousel.current() : 0;
      var els = stage.querySelectorAll('.carousel-slide');
      return els[idx] ? els[idx].querySelector('img') : null;
    }

    function stageMetrics(img) {
      var rect = stage.getBoundingClientRect();
      var w = rect.width || stage.clientWidth || window.innerWidth || 1;
      var h = rect.height || stage.clientHeight || window.innerHeight || 1;
      var baseW = w;
      var baseH = h;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        var fit = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        baseW = img.naturalWidth * fit;
        baseH = img.naturalHeight * fit;
      }
      return {
        left: rect.left,
        top: rect.top,
        width: w,
        height: h,
        cx: rect.left + w / 2,
        cy: rect.top + h / 2,
        baseW: baseW,
        baseH: baseH,
      };
    }

    function clampPan(img, scale, tx, ty) {
      if (scale <= 1) return { x: 0, y: 0 };
      var m = stageMetrics(img);
      var maxX = Math.max(0, (m.baseW * scale - m.width) / 2);
      var maxY = Math.max(0, (m.baseH * scale - m.height) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, tx)),
        y: Math.min(maxY, Math.max(-maxY, ty)),
      };
    }

    function applyZoom(animate) {
      var img = currentImg();
      var zoomed = zoomScale > 1.001;
      stage.classList.toggle('is-zoomed', zoomed);
      dialog.classList.toggle('is-zoomed', zoomed);
      if (!img) return;
      clearTimeout(zoomAnimTimer);
      var useAnim = Boolean(animate && !reducedMotion);
      img.style.transition = useAnim ? 'transform ' + ZOOM_MS + 'ms ' + EASE : 'none';
      img.style.transform = zoomed
        ? 'translate3d(' + zoomX.toFixed(2) + 'px, ' + zoomY.toFixed(2) + 'px, 0) scale(' + zoomScale.toFixed(4) + ')'
        : '';
      if (useAnim) {
        zoomAnimTimer = setTimeout(function () {
          if (img) img.style.transition = 'none';
        }, ZOOM_MS);
      }
    }

    function resetZoom(animate) {
      clearTimeout(zoomAnimTimer);
      zoomScale = 1;
      zoomX = 0;
      zoomY = 0;
      pinch = null;
      pan = null;
      tapCandidate = null;
      stage.classList.remove('is-zoomed');
      dialog.classList.remove('is-zoomed');
      var allImgs = stage.querySelectorAll('.carousel-slide img');
      for (var i = 0; i < allImgs.length; i++) {
        allImgs[i].style.transition = animate && !reducedMotion ? 'transform ' + ZOOM_MS + 'ms ' + EASE : 'none';
        allImgs[i].style.transform = '';
      }
    }

    function touchDistance(t0, t1) {
      return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    }

    function touchMidpoint(t0, t1) {
      return { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
    }

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

    viewerCarousel = createCarousel(stage, {
      canDrag: function () { return zoomScale <= 1.001 && !pinch; },
      onChange: function (i) {
        resetZoom(false);
        loadAround(i);
        showCaption(i);
      },
    });

    function open(list, start) {
      items = list;
      lastTap = null;
      resetZoom(false);
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
      viewerCarousel.reset(start);
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

    prevBtn.addEventListener('click', function () { resetZoom(false); viewerCarousel.step(-1); });
    nextBtn.addEventListener('click', function () { resetZoom(false); viewerCarousel.step(1); });
    closeBtn.addEventListener('click', function () { dialog.close(); });

    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); resetZoom(false); viewerCarousel.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); resetZoom(false); viewerCarousel.step(1); }
    });

    // The part of the screen the photo actually covers (including zoom & pan when zoomed).
    function photoBox(img) {
      if (!img) return null;
      var box = stage.getBoundingClientRect();
      var w = box.width || stage.clientWidth;
      var h = box.height || stage.clientHeight;
      if (!img.naturalWidth || !img.naturalHeight || !w || !h) return null;
      var fit = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      var drawW = img.naturalWidth * fit * zoomScale;
      var drawH = img.naturalHeight * fit * zoomScale;
      var cx = box.left + w / 2 + zoomX;
      var cy = box.top + h / 2 + zoomY;
      return { left: cx - drawW / 2, top: cy - drawH / 2, right: cx + drawW / 2, bottom: cy + drawH / 2 };
    }

    function startPinchFromTouches(touches) {
      var img = currentImg();
      if (!img || touches.length < 2) return;
      var m = stageMetrics(img);
      var d = Math.max(1, touchDistance(touches[0], touches[1]));
      var mid = touchMidpoint(touches[0], touches[1]);
      pinch = {
        startDist: d,
        startScale: zoomScale,
        startTx: zoomX,
        startTy: zoomY,
        midX: mid.x,
        midY: mid.y,
        cx: m.cx,
        cy: m.cy,
      };
    }

    stage.addEventListener('touchstart', function (e) {
      if (!dialog.open) return;
      if (e.touches.length >= 2) {
        if (viewerCarousel) viewerCarousel.abortDrag();
        pan = null;
        tapCandidate = null;
        lastTap = null;
        suppressCloseUntil = Date.now() + 450;
        startPinchFromTouches(e.touches);
        return;
      }
      if (e.touches.length === 1) {
        var t = e.touches[0];
        tapCandidate = { x: t.clientX, y: t.clientY, time: Date.now(), moved: false };
        if (zoomScale > 1.001) {
          pan = { startX: t.clientX, startY: t.clientY, startTx: zoomX, startTy: zoomY, moved: false };
        }
      }
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      if (!dialog.open) return;
      if (e.touches.length >= 2) {
        if (e.cancelable) e.preventDefault();
        if (!pinch) startPinchFromTouches(e.touches);
        var img = currentImg();
        if (!img || !pinch) return;
        var d = Math.max(1, touchDistance(e.touches[0], e.touches[1]));
        var mid = touchMidpoint(e.touches[0], e.touches[1]);
        var rawScale = pinch.startScale * (d / pinch.startDist);
        var nextScale = Math.min(MAX_ZOOM * 1.15, Math.max(0.85, rawScale));
        var ratio = nextScale / pinch.startScale;
        var nextTx = (mid.x - pinch.cx) - ratio * (pinch.midX - pinch.cx - pinch.startTx);
        var nextTy = (mid.y - pinch.cy) - ratio * (pinch.midY - pinch.cy - pinch.startTy);
        var clamped = nextScale > 1 ? clampPan(img, nextScale, nextTx, nextTy) : { x: 0, y: 0 };
        zoomScale = nextScale;
        zoomX = clamped.x;
        zoomY = clamped.y;
        suppressCloseUntil = Date.now() + 450;
        applyZoom(false);
        return;
      }
      if (e.touches.length === 1) {
        var t = e.touches[0];
        if (tapCandidate && (Math.abs(t.clientX - tapCandidate.x) > 10 || Math.abs(t.clientY - tapCandidate.y) > 10)) {
          tapCandidate.moved = true;
        }
        if (pan && zoomScale > 1.001) {
          if (e.cancelable) e.preventDefault();
          var dxPan = t.clientX - pan.startX;
          var dyPan = t.clientY - pan.startY;
          if (Math.abs(dxPan) > 3 || Math.abs(dyPan) > 3) {
            pan.moved = true;
            suppressCloseUntil = Date.now() + 400;
          }
          var panned = clampPan(currentImg(), zoomScale, pan.startTx + dxPan, pan.startTy + dyPan);
          zoomX = panned.x;
          zoomY = panned.y;
          applyZoom(false);
        }
      }
    }, { passive: false });

    function onTouchEnd(e) {
      if (!dialog.open) return;
      if (e.touches.length >= 2) {
        startPinchFromTouches(e.touches);
        return;
      }
      if (e.touches.length === 1 && pinch) {
        pinch = null;
        suppressCloseUntil = Date.now() + 450;
        if (zoomScale < 1.02) {
          resetZoom(true);
        } else {
          if (zoomScale > MAX_ZOOM) {
            zoomScale = MAX_ZOOM;
            var cp = clampPan(currentImg(), zoomScale, zoomX, zoomY);
            zoomX = cp.x;
            zoomY = cp.y;
            applyZoom(true);
          }
          var rem = e.touches[0];
          pan = { startX: rem.clientX, startY: rem.clientY, startTx: zoomX, startTy: zoomY, moved: true };
        }
        return;
      }
      if (e.touches.length === 0) {
        var endedPinch = Boolean(pinch);
        var endedPan = Boolean(pan && pan.moved);
        pinch = null;
        pan = null;

        if (zoomScale < 1.02) {
          if (zoomScale !== 1 || zoomX !== 0 || zoomY !== 0) resetZoom(true);
        } else if (zoomScale > MAX_ZOOM) {
          zoomScale = MAX_ZOOM;
          var settled = clampPan(currentImg(), zoomScale, zoomX, zoomY);
          zoomX = settled.x;
          zoomY = settled.y;
          applyZoom(true);
        }

        if (endedPinch || endedPan) {
          tapCandidate = null;
          lastTap = null;
          suppressCloseUntil = Date.now() + 400;
          return;
        }

        var now = Date.now();
        if (tapCandidate && !tapCandidate.moved && now - tapCandidate.time < 320) {
          var imgTap = currentImg();
          var boxTap = photoBox(imgTap);
          var onPhoto = !boxTap || (
            tapCandidate.x >= boxTap.left &&
            tapCandidate.x <= boxTap.right &&
            tapCandidate.y >= boxTap.top &&
            tapCandidate.y <= boxTap.bottom
          );
          if (onPhoto) {
            if (lastTap && now - lastTap.time < 320 && Math.hypot(tapCandidate.x - lastTap.x, tapCandidate.y - lastTap.y) < 36) {
              if (e.cancelable) e.preventDefault();
              if (viewerCarousel) viewerCarousel.abortDrag();
              lastTap = null;
              tapCandidate = null;
              suppressCloseUntil = now + 450;
              if (zoomScale > 1.05) {
                resetZoom(true);
              } else {
                var mTap = stageMetrics(imgTap);
                zoomScale = DOUBLE_TAP_ZOOM;
                var rawTx = -(zoomScale - 1) * (e.changedTouches[0].clientX - mTap.cx);
                var rawTy = -(zoomScale - 1) * (e.changedTouches[0].clientY - mTap.cy);
                var clampedTap = clampPan(imgTap, zoomScale, rawTx, rawTy);
                zoomX = clampedTap.x;
                zoomY = clampedTap.y;
                applyZoom(true);
              }
              return;
            }
            lastTap = { time: now, x: tapCandidate.x, y: tapCandidate.y };
          } else {
            lastTap = null;
          }
        }
        tapCandidate = null;
      }
    }

    stage.addEventListener('touchend', onTouchEnd);
    stage.addEventListener('touchcancel', function () {
      pinch = null;
      pan = null;
      tapCandidate = null;
      if (zoomScale < 1.02 || zoomScale > MAX_ZOOM) {
        if (zoomScale < 1.02) resetZoom(true);
        else {
          zoomScale = MAX_ZOOM;
          var c = clampPan(currentImg(), zoomScale, zoomX, zoomY);
          zoomX = c.x;
          zoomY = c.y;
          applyZoom(true);
        }
      }
    });

    // Prevent iOS Safari from zooming the outer dialog controls during a pinch gesture.
    stage.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
    stage.addEventListener('gesturechange', function (e) { e.preventDefault(); }, { passive: false });

    window.addEventListener('orientationchange', function () {
      if (dialog.open && zoomScale > 1.001) resetZoom(false);
    });

    // A click on the dark area around the photo closes the viewer.
    function outsidePhoto(e) {
      var img = currentImg();
      var r = img && photoBox(img);
      if (!r) return false;
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    }
    dialog.addEventListener('click', function (e) {
      if (Date.now() < suppressCloseUntil) return;
      if (e.target.closest && e.target.closest('.lb-btn')) return;
      if (zoomScale > 1.001) {
        if (outsidePhoto(e)) dialog.close();
        return;
      }
      if (e.target === dialog || e.target === stage || e.target.classList.contains('lb-inner') || outsidePhoto(e)) {
        dialog.close();
      }
    });

    dialog.addEventListener('close', function () {
      resetZoom(false);
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

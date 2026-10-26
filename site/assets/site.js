/* Model portfolio – shared behaviour.
   Works on every model page. It reads everything it needs from the DOM,
   so it contains no model-specific data. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Beautiful page loader – fades out after initial load ---------------
  (function () {
    var loader = document.getElementById('page-loader');
    if (!loader) return;
    var start = Date.now();
    var minShow = 520;
    var maxWait = 2500;
    var hidden = false;
    // Do NOT lock html/body overflow – that was blocking vertical scroll
    // for up to ~650ms after load and felt janky on image-heavy profiles.
    // The fixed overlay already covers the viewport and fades via opacity.
    function doHide() {
      if (hidden) return;
      hidden = true;
      var elapsed = Date.now() - start;
      var delay = Math.max(0, minShow - elapsed);
      setTimeout(function () {
        loader.classList.add('is-hidden');
        loader.setAttribute('aria-hidden', 'true');
        // Remove from layout after fade so it never blocks clicks / scroll
        setTimeout(function () {
          if (loader && loader.parentNode) loader.style.display = 'none';
        }, 800);
      }, delay);
    }
    if (document.readyState === 'complete') {
      doHide();
    } else {
      window.addEventListener('load', doHide);
      // fail-safe: never keep loader longer than maxWait + minShow
      setTimeout(doHide, maxWait + minShow);
    }
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) doHide();
    });
  })();

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

  // ---- Portfolio category filter & horizontal media rows -----------------
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var mediaGroups = Array.prototype.slice.call(document.querySelectorAll('.media-group'));
  var galleryItems = Array.prototype.slice.call(document.querySelectorAll('.gallery-item'));
  var mediaRows = Array.prototype.slice.call(document.querySelectorAll('[data-media-row]'));

  function syncMediaRowNav(row) {
    var group = row.closest ? row.closest('.media-group') : null;
    if (!group) return;
    var nav = group.querySelector('.media-row-nav');
    if (!nav) return;
    var maxScroll = Math.max(0, (row.scrollWidth || 0) - (row.clientWidth || 0));
    var canScroll = maxScroll > 4;
    nav.hidden = !canScroll;
    if (!canScroll) return;
    var prev = nav.querySelector('[data-row-dir="-1"]');
    var next = nav.querySelector('[data-row-dir="1"]');
    var sl = row.scrollLeft || 0;
    if (prev) prev.disabled = sl <= 2;
    if (next) next.disabled = sl >= maxScroll - 2;
  }

  function syncAllMediaRows() {
    mediaRows.forEach(syncMediaRowNav);
  }

  mediaRows.forEach(function (row) {
    row.addEventListener('scroll', function () { syncMediaRowNav(row); }, { passive: true });
    var group = row.closest ? row.closest('.media-group') : null;
    if (!group) return;
    var arrows = Array.prototype.slice.call(group.querySelectorAll('[data-row-dir]'));
    arrows.forEach(function (arrow) {
      arrow.addEventListener('click', function () {
        var dir = Number(arrow.getAttribute('data-row-dir')) || 1;
        var firstCard = row.querySelector('.media-card');
        var nextCard = firstCard && firstCard.nextElementSibling;
        var stride = 0;
        if (firstCard && nextCard) {
          stride = nextCard.offsetLeft - firstCard.offsetLeft;
        }
        if (!stride && firstCard) {
          stride = firstCard.getBoundingClientRect().width + 20;
        }
        if (!stride) stride = Math.max(240, (row.clientWidth || 320) * 0.85);
        var target = Math.max(0, (row.scrollLeft || 0) + dir * stride);
        if (typeof row.scrollTo === 'function') {
          row.scrollTo({ left: target, behavior: reducedMotion ? 'auto' : 'smooth' });
        } else {
          row.scrollLeft = target;
        }
      });
    });
  });

  window.addEventListener('resize', syncAllMediaRows);
  window.addEventListener('load', syncAllMediaRows);
  syncAllMediaRows();

  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wanted = btn.getAttribute('data-filter');
      var wantedLower = String(wanted || '').toLowerCase();
      filterButtons.forEach(function (other) {
        var active = other === btn;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-pressed', String(active));
      });
      mediaGroups.forEach(function (group) {
        var name = String(group.getAttribute('data-group') || '');
        var show = wanted === 'all' || name === wanted || name.toLowerCase() === wantedLower;
        group.hidden = !show;
      });
      galleryItems.forEach(function (item) {
        var cat = String(item.getAttribute('data-category') || '');
        var show = wanted === 'all' || cat === wanted || cat.toLowerCase() === wantedLower;
        item.hidden = !show;
      });
      syncAllMediaRows();
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
    var slideGap = Number(options.slideGap) || 0;
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
      var r = root.getBoundingClientRect ? root.getBoundingClientRect() : null;
      var w = (r && r.width) || root.clientWidth || window.innerWidth || 1;
      return Math.ceil(w);
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
      var stride = w + slideGap;
      els.forEach(function (el, i) {
        var d = (i - index + n) % n;
        if (d > n / 2) d -= n;                              // nearest way round
        if (n === 2 && i !== index && dx !== 0) d = dx < 0 ? 1 : -1;    // one neighbour: show it on the side being dragged (only while dragging)
        var near = Math.abs(d) <= 1;
        el.style.transition = animate ? 'transform ' + ms + 'ms ' + EASE : 'none';
        el.style.transform = 'translate3d(' + (d * stride + dx) + 'px, 0, 0)';
        el.style.visibility = near ? 'visible' : 'hidden';
        el.classList.toggle('is-current', i === index);
        el.inert = i !== index;
        var img = el.querySelector('img');
        if (img && img.getAttribute('loading') !== 'eager') img.setAttribute('loading', 'eager');
      });
    }

    // Decode the photos that are about to come on screen, so none of them flashes blank.
    function predecode() {
      var els = slides();
      var n = els.length;
      els.forEach(function (el, i) {
        var distance = (i - index + n) % n;
        if (distance > n / 2) distance -= n;
        if (root.classList.contains('hero-carousel')) {
          if (i !== index && i !== (index + 1) % n) return;
        } else if (Math.abs(distance) > 1) {
          return;
        }
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
      if (animate) {
        later(SLIDE_MS, function () {
          busy = false;
          layout(false, 0);
        });
      }
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
      if (e.cancelable) e.preventDefault();
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
      var commit = distance > width() * 0.16 || (distance > 32 && speed > 0.3);
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
    var heroImgs = Array.prototype.slice.call(heroRoot.querySelectorAll('img'));
    heroImgs.forEach(function (img) {
      // Markup already makes every full-size slide eager/high so first-screen
      // images outrank below-the-fold media; decode off the main thread.
      img.decoding = 'async';
      img.fetchPriority = 'high';
    });

    hero = createCarousel(heroRoot, {
      autoplay: Number(heroRoot.getAttribute('data-autoplay')) || 0,
      onChange: function (i) {
        heroDots.forEach(function (dot, j) { dot.classList.toggle('is-active', j === i); });
        var active = heroRoot.querySelectorAll('.carousel-slide')[i];
        var activeImg = active && active.querySelector('img');
        if (activeImg) {
          if (typeof progressiveObserver !== 'undefined' && progressiveObserver) try { progressiveObserver.unobserve(activeImg); } catch (_) {}
          if (activeImg.complete && (activeImg.naturalWidth || 0) > 0) loadFullImageAfterThumbnail(activeImg);
          // Also queue via the concurrency-aware path for portfolio-style staggering
          queueProgressiveUpgrade(activeImg);
          if (!activeImg.complete || (activeImg.naturalWidth || 0) === 0) {
            activeImg.addEventListener('load', function onHeroLoad() {
              activeImg.removeEventListener('load', onHeroLoad);
              queueProgressiveUpgrade(activeImg);
            }, { once: true });
          }
        }
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

  // ---- Automatic retry for photos and videos -------------------------------
  var MAX_MEDIA_RETRIES = 5;

  function getMediaFrame(el) {
    if (!el || !el.closest) return null;
    return el.closest('.gallery-btn') || el.closest('.video-frame') || el.closest('.carousel-slide');
  }

  function updateMediaLoaded(el, loaded) {
    var frame = getMediaFrame(el);
    if (!frame || !frame.classList) return;
    if (loaded) {
      frame.classList.add('is-loaded');
      frame.classList.remove('is-loading');
    } else {
      frame.classList.remove('is-loaded');
      frame.classList.add('is-loading');
    }
  }

  function syncAllFramesForUrl(url, loaded) {
    if (!url || typeof document === 'undefined') return;
    var clean = url.split('#')[0].split('?')[0];
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
    imgs.forEach(function (otherImg) {
      var otherSrc = getMediaSrc(otherImg);
      if (!otherSrc) return;
      var otherClean = otherSrc.split('#')[0].split('?')[0];
      if (otherClean === clean || otherSrc === url || (clean && otherClean && (clean.endsWith(otherClean) || otherClean.endsWith(clean)))) {
        updateMediaLoaded(otherImg, loaded);
      }
    });
  }

  function setupMediaFrameState(el) {
    if (!el) return;
    if (el.tagName === 'IMG') {
      var checkReady = function () {
        var ready = (el.complete && (el.naturalWidth || 0) > 0) || ((el.naturalWidth || 0) > 0);
        if (ready) {
          updateMediaLoaded(el, true);
          syncAllFramesForUrl(getMediaSrc(el), true);
        }
      };
      var isReady = el.complete && (el.naturalWidth || 0) > 0;
      updateMediaLoaded(el, isReady);
      el.addEventListener('load', checkReady);
      el.addEventListener('error', function () {
        updateMediaLoaded(el, false);
      });
      if (el.decode) {
        el.decode().then(checkReady).catch(function () {});
      }
    } else if (el.tagName === 'VIDEO') {
      var isVideoReady = (el.readyState || 0) >= 2 || Boolean(el.getAttribute && el.getAttribute('poster'));
      updateMediaLoaded(el, isVideoReady);
      el.addEventListener('loadeddata', function () { updateMediaLoaded(el, true); });
      el.addEventListener('canplay', function () { updateMediaLoaded(el, true); });
      el.addEventListener('playing', function () { updateMediaLoaded(el, true); });
      el.addEventListener('error', function () {
        updateMediaLoaded(el, false);
      });
    }
  }

  function buildRetryUrl(url, attempt) {
    if (!url || typeof url !== 'string') return url;
    if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return url;
    var hashIdx = url.indexOf('#');
    var hash = '';
    var cleanUrl = url;
    if (hashIdx >= 0) {
      hash = url.slice(hashIdx);
      cleanUrl = url.slice(0, hashIdx);
    }
    var cacheBuster = '_r=' + Date.now() + (attempt ? '_' + attempt : '');
    if (cleanUrl.indexOf('_r=') >= 0) {
      cleanUrl = cleanUrl.replace(/([?&])_r=[^&#]*/, '$1' + cacheBuster);
    } else {
      var sep = cleanUrl.indexOf('?') >= 0 ? '&' : '?';
      cleanUrl = cleanUrl + sep + cacheBuster;
    }
    return cleanUrl + hash;
  }

  function getMediaSrc(el) {
    if (!el) return '';
    var attr = typeof el.getAttribute === 'function' ? el.getAttribute('src') : null;
    return attr || el.src || '';
  }

  function findExistingImage(src) {
    if (!src || typeof document === 'undefined') return null;
    function absoluteUrl(value) {
      if (!value) return '';
      try { return new URL(value, window.location.href).href; }
      catch (_) { return String(value); }
    }
    var requested = absoluteUrl(src);
    var imgs = document.querySelectorAll('img');
    var fallback = null;
    var declared = null;
    for (var i = 0; i < imgs.length; i++) {
      var candidate = imgs[i];
      if (candidate.closest && candidate.closest('#lb-stage')) continue;
      // <picture>/srcset can display an entirely different URL from src.
      // Prefer a decoded, actually selected match over declared fallback URLs.
      if (absoluteUrl(candidate.currentSrc) === requested) {
        if (candidate.complete && candidate.naturalWidth > 0) return candidate;
        fallback = fallback || candidate;
      }
      var candidateSrc = candidate.getAttribute('src') || candidate.src || '';
      var candidateFull = candidate.getAttribute('data-full-src') || '';
      if (!declared && (absoluteUrl(candidateSrc) === requested ||
          absoluteUrl(candidate.src) === requested || absoluteUrl(candidateFull) === requested)) {
        declared = candidate;
      }
    }
    // Exact URL comparison keeps different variants and retry query strings
    // distinct; substring matches could incorrectly reuse a different file.
    return fallback || declared;
  }

  // Preserve actual painted pixels across viewer upgrades and hero retries. A
  // decoded preload alone does not prevent WebKit clearing the visible <img> on
  // src change.
  function holdPopupImage(img) {
    if (!img || img.tagName !== 'IMG' || !img.closest ||
        !(img.closest('#lb-stage') || img.closest('.hero-carousel')) ||
        !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
    if (img._popupCover) return img._popupCover;
    try {
      var canvas = document.createElement('canvas');
      var scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      var ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.className = 'lb-image-cover';
      canvas.setAttribute('aria-hidden', 'true');
      var computed = typeof window !== 'undefined' && window.getComputedStyle
        ? window.getComputedStyle(img) : null;
      canvas.style.transform = computed && computed.transform && computed.transform !== 'none'
        ? computed.transform : (img.style.transform || '');
      canvas.style.transformOrigin = computed && computed.transformOrigin
        ? computed.transformOrigin : '50% 50%';
      var slide = img.closest('.carousel-slide');
      if (!slide) return null;
      slide.appendChild(canvas);
      var revealing = false;
      var cover = {
        element: canvas,
        reveal: function () {
          if (revealing) return;
          revealing = true;
          // Let the decoded replacement paint before fading the retained pixels.
          requestFrame(function () { requestFrame(function () {
            canvas.style.opacity = '0';
            setTimeout(function () {
              if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
              if (img._popupCover === cover) img._popupCover = null;
            }, reducedMotion ? 0 : 220);
          }); });
        }
      };
      img._popupCover = cover;
      return cover;
    } catch (_) { return null; }
  }

  function setMediaSrc(el, url) {
    if (!el || !url) return;
    var current = getMediaSrc(el);
    if (current === url) {
      if ((el.complete && (el.naturalWidth || 0) > 0) || (el.naturalWidth || 0) > 0) {
        updateMediaLoaded(el, true);
        syncAllFramesForUrl(url, true);
      }
      return;
    }
    // Non-blank guarantee: if the new URL 404s, restore the previous src so hero
    // never turns black after a preview was already visible (new profiles have R2
    // preview/thumb URLs that may 404 on first deploy).
    var previous = current;
    var cover = holdPopupImage(el);
    var restored = false;
    var restore = function () {
      if (restored) return;
      if (getMediaSrc(el) !== url) return;
      restored = true;
      try { el.src = previous; } catch (_) {}
      if (typeof el.setAttribute === 'function') el.setAttribute('src', previous);
      if (cover) {
        if (el.decode) el.decode().then(cover.reveal).catch(function () {});
        else el.addEventListener('load', cover.reveal, { once: true });
      }
    };
    var onError = function () { restore(); };
    el.addEventListener('error', onError, { once: true });
    // Keep current low-res visible until new source is decoded — no blink.
    try { el.src = url; } catch (_) {}
    if (typeof el.setAttribute === 'function' && el.getAttribute('src') !== url) {
      el.setAttribute('src', url);
    }
    var check = function () {
      if (getMediaSrc(el) === url && el.complete && (el.naturalWidth || 0) > 0) {
        if (cover) cover.reveal();
        try { el.removeEventListener('error', onError); } catch (_) {}
        updateMediaLoaded(el, true);
        syncAllFramesForUrl(url, true);
      }
    };
    el.addEventListener('load', check, { once: true });
    check();
    if (el.decode) {
      el.decode().then(check).catch(function () {});
    }
  }

  function finishPortfolioUpgrade(img) {
    if (!img) return;
    if (img._portfolioDone) {
      var cb = img._portfolioDone;
      img._portfolioDone = null;
      img._upgradeQueued = false;
      try { cb(); } catch (_) {}
    } else if (img._upgradeQueued && !img.closest('.hero-carousel')) {
      img._upgradeQueued = false;
      // Non-hero early return without queue callback – drain if needed
      if (typeof onPortfolioUpgradeDone === 'function' && portfolioUpgrading > 0) {
        // Only drain if this img was counted as upgrading; otherwise just ensure queue moves
        // The queue's fallback timer will handle, but try to keep moving
      }
    }
  }

  // Cache-only requests never download an uncached original. Also recognize full
  // images already displayed elsewhere (including the lightbox).
  var cachedOriginalChecks;
  function useAvailableOriginal(img) {
    if (!img || img.tagName !== 'IMG') return false;
    var url = img.getAttribute('data-full-src');
    if (!url) return false;
    function promote() {
      if (img.getAttribute('data-full-src') !== url) return;
      img.removeAttribute('data-medium-src');
      img.removeAttribute('data-full-src');
      img._loadingFullImage = false;
      img._loadingFullUrl = '';
      setMediaSrc(img, url);
      finishPortfolioUpgrade(img);
    }
    var images = document.querySelectorAll('img');
    for (var i = 0; i < images.length; i++) {
      var candidate = images[i];
      if (candidate.complete && candidate.naturalWidth > 0 &&
          (candidate.getAttribute('src') === url || candidate.src === url ||
           candidate.currentSrc === url)) {
        promote();
        return true;
      }
    }
    // only-if-cached requires same-origin mode; cross-origin originals retain
    // progressive loading unless already displayed above.
    if (typeof window.fetch !== 'function' || typeof window.URL !== 'function') return false;
    var absolute;
    try {
      absolute = new window.URL(url, window.location.href);
      if (absolute.origin !== window.location.origin) return false;
    } catch (_) { return false; }
    // Carousel reset can call this hoisted function before execution reaches
    // the declaration above. Initialize lazily and never reset pending checks.
    if (!cachedOriginalChecks) cachedOriginalChecks = Object.create(null);
    if (!cachedOriginalChecks[absolute.href]) {
      cachedOriginalChecks[absolute.href] = window.fetch(absolute.href, {
        cache: 'only-if-cached', mode: 'same-origin'
      }).then(function (response) {
        return response.ok && /^image\//i.test(response.headers.get('Content-Type') || '');
      }).catch(function () { return false; });
    }
    cachedOriginalChecks[absolute.href].then(function (available) {
      if (available) promote();
    });
    return false;
  }

  function loadFullImageAfterThumbnail(img) {
    if (!img || img.tagName !== 'IMG') {
      finishPortfolioUpgrade(img);
      return;
    }
    if (useAvailableOriginal(img)) return;
    var currentUrl = getMediaSrc(img);
    var fullUrl = img.getAttribute('data-full-src');
    if (!fullUrl || currentUrl === fullUrl || img.src === fullUrl) {
      if (fullUrl) {
        img.removeAttribute('data-medium-src');
        img.removeAttribute('data-full-src');
      }
      finishPortfolioUpgrade(img);
      return;
    }
    if (img._loadingFullImage && img._loadingFullUrl === fullUrl) return;
    if (typeof window.Image !== 'function') {
      finishPortfolioUpgrade(img);
      return;
    }
    img._loadingFullImage = true;
    img._loadingFullUrl = fullUrl;
    // Gallery upgrades stay low priority so full-size hero/LCP images win.
    var full = new window.Image();
    full.fetchPriority = 'low';
    if (typeof full.setAttribute === 'function') full.setAttribute('fetchpriority', 'low');
    // Keep the current preview visible while downloading. Never wait for an
    // intermediate thumbnail before downloading or displaying the original.
    function showOriginal() {
      if (img.getAttribute('data-full-src') !== fullUrl) return;
      img.removeAttribute('data-medium-src');
      img.removeAttribute('data-full-src');
      img._loadingFullImage = false;
      img._loadingFullUrl = '';
      setMediaSrc(img, fullUrl);
      finishPortfolioUpgrade(img);
    }
    full.onload = function () {
      if (full.decode) full.decode().then(showOriginal).catch(showOriginal);
      else showOriginal();
    };
    full.onerror = function () {
      img._loadingFullImage = false;
      img._loadingFullUrl = '';
      // Preserve the visible preview and source attributes for a later retry.
      finishPortfolioUpgrade(img);
    };
    full.src = fullUrl;
  }

  function advanceImageSourceAfterFailure(img) {
    if (!img || typeof img.getAttribute !== 'function') return false;
    var mediumUrl = img.getAttribute('data-medium-src');
    var fullUrl = img.getAttribute('data-full-src');
    var nextUrl = mediumUrl || fullUrl;
    if (!nextUrl) return false;
    // Preload nextUrl before swapping so a 404 never replaces a visible preview
    // with blank (hero would turn black). Only remove the data-* attr after preload succeeds.
    if (typeof window.Image !== 'function') {
      if (mediumUrl) img.removeAttribute('data-medium-src');
      else img.removeAttribute('data-full-src');
      img._loadingFullImage = false;
      img._loadingFullUrl = '';
      setMediaSrc(img, nextUrl);
      return true;
    }
    var probe = new window.Image();
    probe.onload = function () {
      if (probe.decode) {
        probe.decode().then(function () {
          if (mediumUrl && img.getAttribute('data-medium-src') === mediumUrl) img.removeAttribute('data-medium-src');
          else if (!mediumUrl && img.getAttribute('data-full-src') === fullUrl) img.removeAttribute('data-full-src');
          img._loadingFullImage = false;
          img._loadingFullUrl = '';
          setMediaSrc(img, nextUrl);
        }).catch(function () {
          if (mediumUrl && img.getAttribute('data-medium-src') === mediumUrl) img.removeAttribute('data-medium-src');
          else if (!mediumUrl && img.getAttribute('data-full-src') === fullUrl) img.removeAttribute('data-full-src');
          img._loadingFullImage = false;
          img._loadingFullUrl = '';
          setMediaSrc(img, nextUrl);
        });
      } else {
        if (mediumUrl && img.getAttribute('data-medium-src') === mediumUrl) img.removeAttribute('data-medium-src');
        else if (!mediumUrl && img.getAttribute('data-full-src') === fullUrl) img.removeAttribute('data-full-src');
        img._loadingFullImage = false;
        img._loadingFullUrl = '';
        setMediaSrc(img, nextUrl);
      }
    };
    probe.onerror = function () {
      // Next URL also 404 – drop it and try the following one (medium -> full) without blanking
      if (mediumUrl) {
        if (img.getAttribute('data-medium-src') === mediumUrl) img.removeAttribute('data-medium-src');
        // Try full next, preloaded as well
        var fallback = img.getAttribute('data-full-src');
        if (fallback) {
          var probe2 = new window.Image();
          probe2.onload = function () {
            if (probe2.decode) {
              probe2.decode().then(function () {
                if (img.getAttribute('data-full-src') === fallback) img.removeAttribute('data-full-src');
                img._loadingFullImage = false;
                img._loadingFullUrl = '';
                setMediaSrc(img, fallback);
              }).catch(function () {
                if (img.getAttribute('data-full-src') === fallback) img.removeAttribute('data-full-src');
                img._loadingFullImage = false;
                img._loadingFullUrl = '';
                setMediaSrc(img, fallback);
              });
            } else {
              if (img.getAttribute('data-full-src') === fallback) img.removeAttribute('data-full-src');
              img._loadingFullImage = false;
              img._loadingFullUrl = '';
              setMediaSrc(img, fallback);
            }
          };
          probe2.onerror = function () {
            if (img.getAttribute('data-full-src') === fallback) img.removeAttribute('data-full-src');
            img._loadingFullImage = false;
            img._loadingFullUrl = '';
          };
          probe2.src = fallback;
        } else {
          img._loadingFullImage = false;
          img._loadingFullUrl = '';
        }
      } else {
        if (img.getAttribute('data-full-src') === fullUrl) img.removeAttribute('data-full-src');
        img._loadingFullImage = false;
        img._loadingFullUrl = '';
      }
    };
    probe.src = nextUrl;
    return true;
  }

  function clearRetry(el) {
    if (!el) return;
    clearTimeout(el._retryTimer);
    el._retryTimer = null;
    el._retryAttempts = 0;
    el._waitingForOnline = false;
    updateMediaLoaded(el, true);
    syncAllFramesForUrl(getMediaSrc(el), true);
    if (el.classList && typeof el.classList.remove === 'function') {
      el.classList.remove('is-retrying');
      el.classList.remove('is-failed');
    }
  }

  function retryImage(img) {
    if (!img) return;
    if (img.complete && (img.naturalWidth || 0) > 0) {
      clearRetry(img);
      return;
    }
    var original = img._originalSrc || getMediaSrc(img);
    if (!original || original.indexOf('data:') === 0 || original.indexOf('blob:') === 0) return;
    img._originalSrc = original;

    var attempts = (img._retryAttempts || 0) + 1;
    img._retryAttempts = attempts;
    updateMediaLoaded(img, false);

    if (attempts > MAX_MEDIA_RETRIES) {
      if (img.classList) {
        img.classList.remove('is-retrying');
        img.classList.add('is-failed');
      }
      return;
    }

    if (img.classList) {
      img.classList.add('is-retrying');
      img.classList.remove('is-failed');
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      img._waitingForOnline = true;
      return;
    }

    clearTimeout(img._retryTimer);
    var delay = Math.min(15000, Math.round(800 * Math.pow(1.8, attempts - 1)));

    img._retryTimer = setTimeout(function () {
      var nextUrl = buildRetryUrl(original, attempts);
      setMediaSrc(img, nextUrl);
    }, delay);
  }

  function retryVideo(video) {
    if (!video) return;
    if ((video.readyState || 0) >= 2) {
      clearRetry(video);
      return;
    }
    var original = video._originalSrc || getMediaSrc(video);
    if (!original || original.indexOf('data:') === 0 || original.indexOf('blob:') === 0) return;
    video._originalSrc = original;

    var attempts = (video._retryAttempts || 0) + 1;
    video._retryAttempts = attempts;
    updateMediaLoaded(video, false);

    if (attempts > MAX_MEDIA_RETRIES) {
      if (video.classList) {
        video.classList.remove('is-retrying');
        video.classList.add('is-failed');
      }
      return;
    }

    if (video.classList) {
      video.classList.add('is-retrying');
      video.classList.remove('is-failed');
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      video._waitingForOnline = true;
      return;
    }

    clearTimeout(video._retryTimer);
    var delay = Math.min(15000, Math.round(800 * Math.pow(1.8, attempts - 1)));

    video._retryTimer = setTimeout(function () {
      var nextUrl = buildRetryUrl(original, attempts);
      setMediaSrc(video, nextUrl);
      var poster = typeof video.getAttribute === 'function' ? video.getAttribute('poster') : null;
      if (poster && poster.indexOf('data:') !== 0 && poster.indexOf('blob:') !== 0) {
        video.setAttribute('poster', buildRetryUrl(poster, attempts));
      }
      if (typeof video.load === 'function') {
        try { video.load(); } catch (_) {}
      }
    }, delay);
  }

  function loadFullPosterAfterThumbnail(video) {
    if (!video || video.tagName !== 'VIDEO') return;
    var fullUrl = video.getAttribute && video.getAttribute('data-full-poster');
    if (!fullUrl || video._loadingFullPoster || typeof window.Image !== 'function') return;
    video._loadingFullPoster = true;
    var full = new window.Image();
    full.onload = function () {
      if (video.getAttribute('data-full-poster') !== fullUrl) return;
      video.removeAttribute('data-full-poster');
      video._loadingFullPoster = false;
      video.setAttribute('poster', fullUrl);
    };
    full.onerror = function () { video._loadingFullPoster = false; };
    full.src = fullUrl;
  }

  // Progressive upgrade observer: only upgrade portfolio images when near viewport
  // to avoid N concurrent high-res downloads hanging the browser.
  // Portfolio uses a concurrency-limited queue (max 2) so a model with 30 photos
  // still loads preview first (tiny 64px, no hang) and upgrades medium->full smoothly
  // with blur fade.
  var portfolioUpgradeQueue = [];
  var portfolioUpgrading = 0;
  var MAX_PORTFOLIO_CONCURRENT = 2;
  function onPortfolioUpgradeDone() {
    portfolioUpgrading = Math.max(0, portfolioUpgrading - 1);
    drainPortfolioQueue();
  }
  function drainPortfolioQueue() {
    if (portfolioUpgrading >= MAX_PORTFOLIO_CONCURRENT) return;
    var next = portfolioUpgradeQueue.shift();
    if (!next) return;
    if (!next.getAttribute('data-medium-src') && !next.getAttribute('data-full-src')) {
      next._upgradeQueued = false;
      drainPortfolioQueue();
      return;
    }
    portfolioUpgrading++;
    // Attach completion hook so we know when this img's upgrade chain finished
    next._portfolioDone = onPortfolioUpgradeDone;
    loadFullImageAfterThumbnail(next);
    // Fallback: if an upgrade never starts, release its queue slot after a tick
    setTimeout(function () {
      if (next._upgradeQueued && !next._loadingFullImage) {
        next._upgradeQueued = false;
        onPortfolioUpgradeDone();
      }
    }, 1200);
  }
  function enqueuePortfolioUpgrade(img) {
    if (!img || img._upgradeQueued) return;
    img._upgradeQueued = true;
    portfolioUpgradeQueue.push(img);
    drainPortfolioQueue();
  }

  var progressiveObserver = null;
  if ('IntersectionObserver' in window && !reducedMotion) {
    progressiveObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          try { progressiveObserver.unobserve(img); } catch (_) {}
          if (img.getAttribute('data-medium-src') || img.getAttribute('data-full-src')) {
            // New heroes have no progressive attrs; this supports cached old markup.
            var isHero = img.closest && img.closest('.hero-carousel');
            if (isHero) loadFullImageAfterThumbnail(img);
            else enqueuePortfolioUpgrade(img);
          }
        }
      });
    }, { rootMargin: '400px 0px', threshold: 0.01 });
  }

  function queueProgressiveUpgrade(img) {
    if (!img || img.tagName !== 'IMG') return;
    if (!img.getAttribute('data-medium-src') && !img.getAttribute('data-full-src')) return;
    // New heroes load full-size directly; retain this for cached old markup.
    var hero = img.closest && img.closest('.hero-carousel');
    if (hero) {
      var slide = img.closest('.carousel-slide');
      if (slide && slide.classList.contains('is-current')) {
        loadFullImageAfterThumbnail(img);
      } else if (progressiveObserver) {
        try { progressiveObserver.observe(img); } catch (_) { loadFullImageAfterThumbnail(img); }
      } else {
        setTimeout(function () { loadFullImageAfterThumbnail(img); }, 600);
      }
      return;
    }
    if (progressiveObserver) {
      try { progressiveObserver.observe(img); } catch (_) { enqueuePortfolioUpgrade(img); }
    } else {
      enqueuePortfolioUpgrade(img);
    }
  }

  function observeMedia(el) {
    if (!el || el._retryObserved) return;
    el._retryObserved = true;
    if (el.tagName === 'IMG') useAvailableOriginal(el);
    setupMediaFrameState(el);
    if (el.tagName === 'IMG') {
      el.addEventListener('error', function () {
        if (!advanceImageSourceAfterFailure(el)) retryImage(el);
      });
      el.addEventListener('load', function () {
        if ((el.naturalWidth || 0) > 0) {
          clearRetry(el);
          queueProgressiveUpgrade(el);
        }
      });
      el.addEventListener('click', function () {
        if (el.classList && el.classList.contains('is-failed')) {
          el._retryAttempts = 0;
          retryImage(el);
        }
      });
      if (el.complete && (el.naturalWidth || 0) > 0) queueProgressiveUpgrade(el);
    } else if (el.tagName === 'VIDEO') {
      loadFullPosterAfterThumbnail(el);
      el.addEventListener('error', function () { retryVideo(el); });
      el.addEventListener('loadeddata', function () { clearRetry(el); });
      el.addEventListener('canplay', function () { clearRetry(el); });
      el.addEventListener('playing', function () { clearRetry(el); });
      el.addEventListener('click', function () {
        if (el.classList && el.classList.contains('is-failed')) {
          el._retryAttempts = 0;
          retryVideo(el);
        }
      });
    }
  }

  function retryAllFailed() {
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
    var vids = Array.prototype.slice.call(document.querySelectorAll('video'));
    imgs.forEach(function (img) {
      if (img._waitingForOnline || (img.classList && (img.classList.contains('is-failed') || img.classList.contains('is-retrying')))) {
        img._waitingForOnline = false;
        img._retryAttempts = 0;
        retryImage(img);
      }
    });
    vids.forEach(function (vid) {
      if (vid._waitingForOnline || (vid.classList && (vid.classList.contains('is-failed') || vid.classList.contains('is-retrying')))) {
        vid._waitingForOnline = false;
        vid._retryAttempts = 0;
        retryVideo(vid);
      }
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', retryAllFailed);
    window.addEventListener('error', function (e) {
      var target = e && e.target;
      if (!target || !target.tagName) return;
      if (target.tagName === 'IMG') retryImage(target);
      else if (target.tagName === 'VIDEO') retryVideo(target);
    }, true);
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') retryAllFailed();
    });
  }

  var initMediaEls = Array.prototype.slice.call(document.querySelectorAll('img, video'));
  initMediaEls.forEach(observeMedia);

  // ---- Photo viewer --------------------------------------------------------
  var dialog = document.getElementById('lightbox');
  var stage = document.getElementById('lb-stage');
  if (typeof window.ResizeObserver === 'function') {
    var carouselRo = new window.ResizeObserver(function () {
      if (hero) hero.relayout();
      if (viewerCarousel) viewerCarousel.relayout();
    });
    if (heroRoot) carouselRo.observe(heroRoot);
    if (stage) carouselRo.observe(stage);
  }
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
      if (img._popupCover) img._popupCover.element.style.transform = img.style.transform;
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
        if (allImgs[i]._popupCover) allImgs[i]._popupCover.element.style.transform = '';
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
        thumb: btn.getAttribute('data-thumb') || '',
        webp: btn.getAttribute('data-viewer-webp') || '',
        avif: btn.getAttribute('data-viewer-avif') || '',
        alt: btn.getAttribute('data-alt') || '',
        caption: btn.getAttribute('data-caption') || '',
      };
    }

    function setPopupImage(img, item) {
      if (item.webp) {
        // Viewer-sized candidates are selected only when this slide is opened.
        if (item.avif && img.parentNode && img.parentNode.tagName !== 'PICTURE') {
          var picture = document.createElement('picture');
          var source = document.createElement('source');
          source.setAttribute('type', 'image/avif');
          source.setAttribute('srcset', item.avif);
          source.setAttribute('sizes', '100vw');
          img.parentNode.insertBefore(picture, img);
          picture.appendChild(source);
          picture.appendChild(img);
        }
        img.setAttribute('sizes', '100vw');
        img.setAttribute('srcset', item.webp);
        setMediaSrc(img, item.src);
        return;
      }
      if (item.thumb && item.thumb !== item.src) {
        img.setAttribute('data-full-src', item.src);
        setMediaSrc(img, item.thumb);
      } else {
        setMediaSrc(img, item.src);
      }
    }

    // Loads the photo on screen and its two neighbours; the rest load when reached.
    function loadAround(i) {
      var els = stage.querySelectorAll('.carousel-slide');
      var n = items.length;
      [-1, 0, 1].forEach(function (d) {
        var j = (i + d + n) % n;
        var slide = els[j];
        var img = slide && slide.querySelector('img');
        if (img && !getMediaSrc(img)) {
          var item = items[j];
          var existing = findExistingImage(item.src);
          if (existing && existing.naturalWidth && !img.naturalWidth) {
            img.width = existing.naturalWidth;
            img.height = existing.naturalHeight;
          }
          setPopupImage(img, item);
          if ((existing && existing.complete && (existing.naturalWidth || 0) > 0) || (img.complete && (img.naturalWidth || 0) > 0)) {
            updateMediaLoaded(img, true);
            syncAllFramesForUrl(item.src, true);
          }
        }
      });
    }

    function showCaption(i) {
      var text = items[i] ? items[i].caption : '';
      caption.textContent = text;
      caption.hidden = !text;
    }

    viewerCarousel = createCarousel(stage, {
      slideGap: 24,
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
      list.forEach(function (item, idx) {
        var figure = document.createElement('figure');
        figure.className = 'carousel-slide';
        var img = document.createElement('img');
        img.alt = item.alt || '';
        img.decoding = 'async';
        img.draggable = false;

        figure.appendChild(img);
        stage.appendChild(figure);
        observeMedia(img);

        var existing = findExistingImage(item.src);
        var isPreloaded = !!(existing && existing.complete && (existing.naturalWidth || 0) > 0);

        var isNear = Math.abs(idx - start) <= 1 || (start === 0 && idx === list.length - 1) || (start === list.length - 1 && idx === 0);
        if (isNear || isPreloaded) {
          if (existing && existing.naturalWidth) {
            img.width = existing.naturalWidth;
            img.height = existing.naturalHeight;
          }
          setPopupImage(img, item);
        }

        if (isPreloaded || (img.complete && (img.naturalWidth || 0) > 0)) {
          figure.classList.add('is-loaded');
          figure.classList.remove('is-loading');
        } else {
          figure.classList.add('is-loading');
        }

        if (img.decode) {
          img.decode().then(function () {
            updateMediaLoaded(img, true);
            syncAllFramesForUrl(item.src, true);
          }).catch(function () {});
        }
      });
      dialog.classList.toggle('is-single', list.length < 2);
      if (hero) hero.pause();
      dialog.showModal();
      viewerCarousel.reset(start);
      closeBtn.focus({ preventScroll: true });
    }

    // The gallery photos currently shown (the category filter may hide some).
    function currentButtons() {
      return galleryItems
        .filter(function (item) {
          if (item.hidden) return false;
          var group = item.closest ? item.closest('.media-group') : null;
          return !group || !group.hidden;
        })
        .map(function (item) { return item.querySelector('.gallery-btn'); })
        .filter(Boolean);
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

  // ---- Row & video frame sizing + thumbnails -------------------------------
  var UNIFORM_FRAME = { w: 2, h: 3 };
  var mediaRows = Array.prototype.slice.call(document.querySelectorAll('[data-media-row]'));
  var videoEls = Array.prototype.slice.call(document.querySelectorAll('.video-frame video'));
  var hasPortfolioPhotos = document.querySelectorAll('.gallery-btn').length > 0;

  function setRowFrameRatio(row, ratioText) {
    if (!row || !row.style) return;
    if (typeof row.style.setProperty === 'function') {
      if (ratioText) row.style.setProperty('--row-frame-ratio', ratioText);
      else if (typeof row.style.removeProperty === 'function') row.style.removeProperty('--row-frame-ratio');
    } else {
      row.style['--row-frame-ratio'] = ratioText || '';
    }
  }

  function readImgDims(img) {
    if (!img) return null;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      return { w: img.naturalWidth, h: img.naturalHeight };
    }
    var aw = Number(img.getAttribute && img.getAttribute('width'));
    var ah = Number(img.getAttribute && img.getAttribute('height'));
    if (aw > 0 && ah > 0) return { w: aw, h: ah };
    return null;
  }

  function readVideoNativeDims(v) {
    if (!v) return null;
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      return { w: v.videoWidth, h: v.videoHeight };
    }
    var nw = Number(v.getAttribute && v.getAttribute('data-natural-w'));
    var nh = Number(v.getAttribute && v.getAttribute('data-natural-h'));
    if (nw > 0 && nh > 0) return { w: nw, h: nh };
    return null;
  }

  function landscapeFrameForDims(dims) {
    if (!dims.length) return { w: 3, h: 2 };
    if (dims.length === 1) return { w: dims[0].w, h: dims[0].h };
    var ratios = dims.map(function (d) { return d.w / d.h; }).sort(function (a, b) { return a - b; });
    if (ratios[ratios.length - 1] - ratios[0] <= 0.02) {
      return { w: dims[0].w, h: dims[0].h };
    }
    var mid = Math.floor(ratios.length / 2);
    var median = ratios.length % 2 === 1 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
    var clamped = Math.min(2.2, Math.max(1.25, median));
    return { w: Math.round(clamped * 1000), h: 1000 };
  }

  function inspectMediaRow(row) {
    if (!row) {
      return { vids: [], btns: [], hasPhotos: false, allLandscape: false, rowLandscapeFrame: null };
    }
    var vids = Array.prototype.slice.call(row.querySelectorAll('.video-frame video'));
    var btns = Array.prototype.slice.call(row.querySelectorAll('.gallery-btn'));
    var hasPhotos = btns.length > 0 || (row.getAttribute && row.getAttribute('data-has-photos') === '1');
    var knownDims = [];
    vids.forEach(function (v) {
      var d = readVideoNativeDims(v);
      if (d) knownDims.push(d);
    });
    btns.forEach(function (btn) {
      var img = btn.querySelector ? btn.querySelector('img') : null;
      var d = readImgDims(img);
      if (d) knownDims.push(d);
    });
    var totalCount = vids.length + Math.max(btns.length, (!btns.length && hasPhotos) ? 1 : 0);
    var allLandscape =
      totalCount > 0 &&
      knownDims.length === totalCount &&
      knownDims.every(function (d) { return d.w > d.h; });
    var rowLandscapeFrame = (allLandscape && hasPhotos) ? landscapeFrameForDims(knownDims) : null;
    return {
      vids: vids,
      btns: btns,
      hasPhotos: hasPhotos,
      allLandscape: allLandscape,
      rowLandscapeFrame: rowLandscapeFrame,
    };
  }

  function targetFrameDimsForVideo(videoEl, rowInfo) {
    var row = videoEl && videoEl.closest ? videoEl.closest('[data-media-row]') : null;
    var info = rowInfo || inspectMediaRow(row);
    var nativeDims = readVideoNativeDims(videoEl);

    if (info.allLandscape) {
      return info.hasPhotos ? info.rowLandscapeFrame : nativeDims;
    }
    if (info.hasPhotos) {
      return UNIFORM_FRAME;
    }
    if (nativeDims) {
      if (nativeDims.w > nativeDims.h) return nativeDims;
      return hasPortfolioPhotos ? UNIFORM_FRAME : nativeDims;
    }
    return null;
  }

  function syncMediaRowFraming(row) {
    if (!row) return;
    var info = inspectMediaRow(row);
    row.classList.toggle('is-landscape-row', info.allLandscape);
    if (info.rowLandscapeFrame) {
      setRowFrameRatio(row, info.rowLandscapeFrame.w + ' / ' + info.rowLandscapeFrame.h);
    } else {
      setRowFrameRatio(row, '');
    }
    info.vids.forEach(function (videoEl) {
      var frameDims = targetFrameDimsForVideo(videoEl, info);
      if (!frameDims) return;
      var card = videoEl.closest ? videoEl.closest('.video-card') : null;
      var portrait = frameDims.h > frameDims.w;
      videoEl.style.aspectRatio = frameDims.w + ' / ' + frameDims.h;
      if (card) {
        card.classList.toggle('is-portrait', portrait);
        card.classList.toggle('is-landscape', !portrait);
      }
      if (typeof videoEl._onFrameRatioSync === 'function') {
        videoEl._onFrameRatioSync(frameDims.w / frameDims.h);
      }
    });
    syncMediaRowNav(row);
  }

  function syncVideoOrientation(videoEl) {
    var row = videoEl && videoEl.closest ? videoEl.closest('[data-media-row]') : null;
    if (row) {
      syncMediaRowFraming(row);
      return;
    }
    var frameDims = targetFrameDimsForVideo(videoEl);
    if (!frameDims) return;
    var card = videoEl.closest ? videoEl.closest('.video-card') : null;
    var portrait = frameDims.h > frameDims.w;
    videoEl.style.aspectRatio = frameDims.w + ' / ' + frameDims.h;
    if (card) {
      card.classList.toggle('is-portrait', portrait);
      card.classList.toggle('is-landscape', !portrait);
    }
    syncAllMediaRows();
  }

  mediaRows.forEach(function (row) {
    var imgs = Array.prototype.slice.call(row.querySelectorAll('.gallery-btn img'));
    imgs.forEach(function (img) {
      img.addEventListener('load', function () { syncMediaRowFraming(row); });
    });
    syncMediaRowFraming(row);
  });

  function setupVideoPlayer(v) {
    syncVideoOrientation(v);
    v.addEventListener('loadedmetadata', function () { syncVideoOrientation(v); });
    v.addEventListener('loadeddata', function () { updateMediaLoaded(v, true); syncVideoOrientation(v); });
    v.addEventListener('resize', function () { syncVideoOrientation(v); });
    // Idle players show a poster (or placeholder), never a network-loading spinner.
    updateMediaLoaded(v, true);
    var frame = v.closest ? v.closest('.video-frame') : null;
    var button = frame && frame.querySelector('.video-play-button');
    if (button) button.addEventListener('click', function () {
      var source = v.getAttribute('data-video-src');
      if (source) {
        v.setAttribute('src', source);
        v.removeAttribute('data-video-src');
        v.load();
      }
      button.hidden = true;
      try {
        var playing = v.play();
        if (playing && typeof playing.catch === 'function') {
          playing.catch(function () { button.hidden = false; });
        }
      } catch (_) { button.hidden = false; }
    });
    v.addEventListener('play', function () {
      videoEls.forEach(function (other) {
        if (other !== v && !other.paused) {
          try { other.pause(); } catch (_) {}
        }
      });
    });
  }

  videoEls.forEach(setupVideoPlayer);

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

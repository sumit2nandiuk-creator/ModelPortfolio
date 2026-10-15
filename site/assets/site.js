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
    var prev = dialog.querySelector('.lb-prev');
    var next = dialog.querySelector('.lb-next');
    var close = dialog.querySelector('.lb-close');
    var list = [];
    var index = 0;
    var touchStartX = null;

    function currentButtons() {
      return galleryItems
        .filter(function (item) { return !item.hidden; })
        .map(function (item) { return item.querySelector('.gallery-btn'); });
    }

    function render() {
      var btn = list[index];
      img.src = btn.getAttribute('data-src');
      img.alt = btn.getAttribute('data-alt') || '';
      caption.textContent = btn.getAttribute('data-caption') || '';
      dialog.classList.toggle('is-single', list.length < 2);
    }

    function step(delta) {
      if (list.length < 2) return;
      index = (index + delta + list.length) % list.length;
      render();
    }

    function open(btn) {
      list = currentButtons();
      index = Math.max(0, list.indexOf(btn));
      render();
      dialog.showModal();
      close.focus({ preventScroll: true });
    }

    galleryItems.forEach(function (item) {
      var btn = item.querySelector('.gallery-btn');
      if (btn) btn.addEventListener('click', function () { open(btn); });
    });

    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    close.addEventListener('click', function () { dialog.close(); });

    // Click on the dark backdrop (outside the image) closes the viewer.
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target.classList.contains('lb-inner') || e.target.classList.contains('lb-figure')) {
        dialog.close();
      }
    });

    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    });

    dialog.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    dialog.addEventListener('touchend', function (e) {
      if (touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });

    dialog.addEventListener('close', function () {
      img.removeAttribute('src');
      img.alt = '';
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

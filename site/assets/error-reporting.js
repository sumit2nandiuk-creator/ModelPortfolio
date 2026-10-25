/* Minimal, privacy-conscious client error collection for the application. */
(function () {
  'use strict';

  if (window.__appErrorReporter) return;

  var endpoint = '/api/errors';
  var sent = Object.create(null);
  var sentCount = 0;
  var startedAt = Date.now();

  function safePath(value) {
    if (!value) return '';
    try { return new URL(String(value), window.location.href).pathname.slice(0, 500); }
    catch (_) { return String(value).split(/[?#]/)[0].slice(0, 500); }
  }

  function safeStack(value) {
    return String(value || '').slice(0, 4000);
  }

  function send(source, message, details) {
    var text = String(message || 'Unknown application error').slice(0, 1200);
    var detail = details && typeof details === 'object' ? details : {};
    var key = source + '|' + text + '|' + (detail.resource || detail.file || '');
    var now = Date.now();
    if (sent[key] && now - sent[key] < 60_000) return;
    if (now - startedAt > 60_000) { sent = Object.create(null); sentCount = 0; startedAt = now; }
    if (sentCount >= 30) return;
    sent[key] = now;
    sentCount += 1;

    var payload = {
      source: source,
      message: text,
      path: safePath(window.location.pathname),
      details: {
        resource: safePath(detail.resource),
        file: safePath(detail.file),
        line: Number(detail.line) || undefined,
        column: Number(detail.column) || undefined,
        stack: safeStack(detail.stack),
        name: String(detail.name || '').slice(0, 100),
      },
    };
    var body;
    try { body = JSON.stringify(payload); } catch (_) { return; }

    try {
      if (navigator.sendBeacon && window.Blob) {
        var accepted = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        if (accepted) return;
      }
    } catch (_) {}
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(function () {});
    } catch (_) {}
  }

  window.__appErrorReporter = { report: send };

  window.addEventListener('error', function (event) {
    var target = event && event.target;
    if (target && target !== window && target.tagName) {
      var tag = String(target.tagName).toLowerCase();
      if (tag === 'img' || tag === 'video' || tag === 'script' || tag === 'link') {
        var resource = target.currentSrc || target.src || target.href || '';
        send('frontend-resource', tag + ' failed to load', { resource: resource, name: tag });
      }
      return;
    }
    var error = event && event.error;
    send('frontend-js', event && event.message || (error && error.message) || 'Uncaught frontend error', {
      file: event && event.filename,
      line: event && event.lineno,
      column: event && event.colno,
      stack: error && error.stack,
      name: error && error.name,
    });
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    send('frontend-promise', reason && reason.message || String(reason || 'Unhandled promise rejection'), {
      stack: reason && reason.stack,
      name: reason && reason.name,
    });
  });
})();

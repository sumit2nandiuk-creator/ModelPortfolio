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
        clientTime: new Date().toISOString(),
        userAgent: String(navigator.userAgent || '').slice(0, 400),
        language: String(navigator.language || '').slice(0, 40),
        online: navigator.onLine,
        viewport: [window.innerWidth || 0, window.innerHeight || 0].join('x'),
        pixelRatio: Number(window.devicePixelRatio) || 1,
        visibility: document.visibilityState || '',
        readyState: document.readyState || '',
        uptimeMs: Math.round(window.performance && window.performance.now ? window.performance.now() : 0),
        connection: String((navigator.connection && navigator.connection.effectiveType) || '').slice(0, 40),
        mediaCode: Number(detail.mediaCode) || undefined,
        mediaState: Number(detail.mediaState) || undefined,
        networkState: Number(detail.networkState) || undefined,
        currentTime: Number(detail.currentTime) || undefined,
        dimensions: String(detail.dimensions || '').slice(0, 60),
        cause: safeStack(detail.cause).slice(0, 500),
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
        send('frontend-resource', tag + ' failed to load', { resource: resource, name: tag,
          mediaCode: target.error && target.error.code,
          mediaState: target.readyState, networkState: target.networkState,
          currentTime: target.currentTime,
          dimensions: [target.naturalWidth || target.videoWidth || 0, target.naturalHeight || target.videoHeight || 0].join('x')
        });
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
      cause: error && error.cause && (error.cause.stack || error.cause.message || String(error.cause)),
    });
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    send('frontend-promise', reason && reason.message || String(reason || 'Unhandled promise rejection'), {
      stack: reason && reason.stack,
      name: reason && reason.name,
      cause: reason && reason.cause && (reason.cause.stack || reason.cause.message || String(reason.cause)),
    });
  });
})();

// Private error dashboard shell. Error data is served separately by authenticated /api/errors.
const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Application errors</title>
  <style>
    :root{color-scheme:light;--ink:#211d18;--muted:#71695f;--line:#e5ded3;--paper:#f8f5ef;--card:#fffdf9;--accent:#9a6a3c}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
    main{width:min(100% - 24px,1100px);margin:20px auto 40px}header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}header p{margin:0 0 4px}h1{font:500 1.8rem/1.1 Georgia,serif;margin:0}a{color:var(--accent)}.muted{color:var(--muted)}
    .panel,.error{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin:8px 0}.panel p{margin:4px 0 8px}
    label{display:block;font-size:12px;font-weight:600}input{width:min(100%,380px);padding:7px 10px;margin:4px 8px 0 0;border:1px solid var(--line);border-radius:6px;font:inherit}
    button{border:0;border-radius:6px;padding:7px 11px;background:var(--ink);color:white;font:600 13px/1.4 system-ui,sans-serif;cursor:pointer;margin:4px 6px 0 0}button.secondary{background:#eee8de;color:var(--ink)}button:disabled{opacity:.55;cursor:wait}button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
    #status{min-height:1.45em;margin:6px 0 0;font-size:13px}.error{border-left:3px solid var(--accent)}.error-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.source{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);font-weight:700}.time,.path{color:var(--muted);font-size:12px}.copy-error{margin:0 0 0 auto}.message{font-weight:650;overflow-wrap:anywhere;margin:6px 0;line-height:1.35}.path{margin:3px 0;overflow-wrap:anywhere}
    details{margin-top:6px}summary{cursor:pointer;color:var(--accent);font-size:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f0e9;padding:9px;border-radius:6px;max-height:260px;overflow:auto;font-size:12px;margin:6px 0 0}
    @media(max-width:600px){header{align-items:flex-start}h1{font-size:1.5rem}.panel,.error{padding:10px}input{width:100%}.time{font-size:11px}}
  </style>
</head>
<body>
  <main>
    <header><div><p class="muted">Portfolio administration</p><h1>Application errors</h1></div><a href="/admin/">Back to admin</a></header>
    <section class="panel" aria-label="Error log access">
      <p class="muted">Error records include frontend JavaScript and media failures, plus backend API/runtime errors. Sign in with the admin token to view them.</p>
      <label for="token">Admin token</label><input id="token" type="password" autocomplete="current-password" spellcheck="false">
      <button id="load" type="button">Load errors</button><button id="refresh" class="secondary" type="button">Refresh</button>
      <p id="status" role="status" aria-live="polite"></p>
    </section>
    <section id="records" aria-live="polite"></section>
    <button id="older" class="secondary" type="button" hidden>Load older errors</button>
  </main>
  <script src="/assets/error-reporting.js" defer></script>
  <script src="/assets/errors-dashboard.js" defer></script>
</body>
</html>`;

export function onRequest() {
  return new Response(HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

// Private error dashboard shell. Error data is served separately by authenticated /api/errors.
const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Application errors</title>
  <style>
    :root{color-scheme:light;--ink:#211d18;--muted:#71695f;--line:#e5ded3;--paper:#f8f5ef;--card:#fffdf9;--accent:#9a6a3c;--danger:#a34336}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
    main{width:min(100% - 32px,1000px);margin:40px auto 80px}header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}
    h1{font:500 clamp(2rem,5vw,3rem)/1.1 Georgia,serif;margin:0}a{color:var(--accent)}.muted{color:var(--muted)}
    .panel,.error{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0}
    label{display:block;font-weight:600;margin-bottom:8px}input{display:block;width:100%;max-width:560px;padding:11px 12px;margin-top:6px;border:1px solid var(--line);border-radius:8px;font:inherit}
    button{border:0;border-radius:8px;padding:10px 16px;background:var(--ink);color:white;font:inherit;font-weight:600;cursor:pointer;margin:10px 8px 0 0}button.secondary{background:#eee8de;color:var(--ink)}button:disabled{opacity:.55;cursor:wait}
    #status{min-height:1.5em;margin:10px 0}.error{border-left:4px solid var(--accent)}.error-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.source{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);font-weight:700}.time,.path{color:var(--muted);font-size:.9rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f0e9;padding:12px;border-radius:8px;max-height:360px;overflow:auto;margin-bottom:0}.message{font-weight:650;overflow-wrap:anywhere}details{margin-top:12px}summary{cursor:pointer;color:var(--accent)}
    @media(max-width:600px){main{margin-top:24px}.panel,.error{padding:15px}header{align-items:flex-start}}
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

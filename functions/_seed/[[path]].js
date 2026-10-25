// Internal build seed files (dist/_seed/*) are only read via env.ASSETS inside Pages Functions;
// block direct public HTTP requests so neutral 404 behaviour is preserved.

export async function onRequest(context) {
  if (context.env?.ASSETS && typeof context.env.ASSETS.fetch === 'function') {
    const notFoundUrl = new URL('/404.html', context.request.url);
    const res = await context.env.ASSETS.fetch(new Request(notFoundUrl.toString(), { method: 'GET' }));
    if (res && res.ok) {
      return new Response(context.request.method === 'HEAD' ? null : res.body, {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
  }
  return new Response('Not found.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

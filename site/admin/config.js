// Admin API base URL.
// Leave empty ('') when hosting on Cloudflare Pages — /admin/ uses the built-in /api Pages Functions
// on the same domain automatically. Set to 'https://portfolio-admin.<subdomain>.workers.dev' only if
// you host the static site elsewhere (such as GitHub Pages) and deploy worker/ separately.
window.ADMIN_CONFIG = {
  apiBase: '',
};

#!/usr/bin/env node
// Tiny static file server for dist/ (used for local preview).
// Mirrors typical static-host behaviour:
//   /slug           -> redirect to /slug/
//   /slug/          -> dist/slug/index.html
//   anything else   -> dist/404.html with status 404
// Only files inside dist/ can ever be read.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] ?? path.join(here, '..', 'dist'));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
};

async function statOrNull(p) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function sendFile(req, res, filePath, status = 200) {
  const type = TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const body = await fs.readFile(filePath);
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      return res.end('Bad request');
    }
    if (pathname.includes('\0')) {
      res.writeHead(400);
      return res.end('Bad request');
    }

    let filePath = path.join(root, pathname);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    let stat = await statOrNull(filePath);
    if (stat?.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${pathname}/${url.search}` });
        return res.end();
      }
      filePath = path.join(filePath, 'index.html');
      stat = await statOrNull(filePath);
    }

    if (stat?.isFile()) return await sendFile(req, res, filePath);

    return await sendFile(req, res, path.join(root, '404.html'), 404);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`);
});

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
};

/**
 * Serves the working tree as GitHub Pages would. `override` can replace a
 * response by URL path, which lets tests simulate corrupted or missing files.
 */
export async function startServer({ root = ROOT, override = () => null, cacheControl = 'no-store' } = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      requests.push({ pathname, cacheControl: req.headers['cache-control'] ?? null });
      const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const replaced = override(pathname);
      if (replaced?.status) { res.writeHead(replaced.status).end(); return; }
      const data = replaced?.body ?? await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': cacheControl,
      });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

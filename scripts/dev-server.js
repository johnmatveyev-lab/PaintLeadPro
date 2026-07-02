// Minimal local dev server that mirrors Vercel's behavior:
//  - serves static files from the repo root
//  - routes /api/<name> to the default export of api/<name>.js
// Usage: node scripts/dev-server.js [port]

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

// Vercel-style res helpers
function enhanceRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return raw; }
}

const server = http.createServer(async (req, res) => {
  enhanceRes(res);
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice('/api/'.length).replace(/[^a-zA-Z0-9_-]/g, '');
      const file = path.join(ROOT, 'api', `${name}.js`);
      if (!name || name.startsWith('_') || !existsSync(file)) {
        return res.status(404).json({ error: 'Not found' });
      }
      const mod = await import(`file://${file}`);
      req.body = await readJsonBody(req);
      req.query = Object.fromEntries(url.searchParams);
      await mod.default(req, res);
      if (!res.writableEnded) res.end();
      return;
    }

    // Static files
    let filePath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
    const abs = path.join(ROOT, filePath);
    if (!abs.startsWith(ROOT) || !existsSync(abs)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const data = await readFile(abs);
    res.setHeader('Content-Type', MIME[path.extname(abs)] || 'application/octet-stream');
    res.end(data);
  } catch (err) {
    console.error('Dev server error:', err);
    if (!res.writableEnded) res.status(500).json({ error: 'Internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`PaintLead Pro dev server running at http://localhost:${PORT}`);
});

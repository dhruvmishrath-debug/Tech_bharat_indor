// Serves the built React app plus a small payment API (so "genuine failures" are real HTTP failures).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DIST = path.resolve('dist-web');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function luhn(n) { let s = 0, d = false; for (let i = n.length - 1; i >= 0; i--) { let x = +n[i]; if (d) { x *= 2; if (x > 9) x -= 9; } s += x; d = !d; } return n.length >= 13 && s % 10 === 0; }
function validate({ card = '', expiry = '', cvv = '' }) {
  const digits = card.replace(/\s/g, ''); const m = /^(\d\d)\/(\d\d)$/.exec(expiry.trim());
  return /^\d+$/.test(digits) && luhn(digits) && m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 26 && /^\d{3,4}$/.test(cvv.trim());
}

export function ensureBuilt() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) execSync('npx vite build --logLevel warn', { stdio: 'inherit' });
}

export async function startServer({ port = 0 } = {}) {
  ensureBuilt();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      let body = ''; req.on('data', (c) => (body += c));
      return req.on('end', () => setTimeout(() => {
        const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
        if (url.pathname === '/api/payments/v2') return json(500, { error: 'Internal Server Error' }); // the regression behind Version C
        let p = {}; try { p = JSON.parse(body); } catch {}
        return validate(p) ? json(200, { orderId: Math.floor(100000 + Math.random() * 900000) }) : json(402, { error: 'Your card was declined. Check the details and try again.' });
      }, 30));
    }
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(DIST) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, url: (v) => ({ name: `version-${v}`, url: `${base}/?v=${v}` }), close: () => new Promise((r) => server.close(r)) };
}

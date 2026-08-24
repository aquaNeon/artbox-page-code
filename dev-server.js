/* ============================================================
   Dev server for page-transition.js / .css

     node dev-server.js            → http://localhost:5173
     node dev-server.js 4000       → another port

   Point the Webflow footer/head embeds at this instead of
   raw.githack.com while working, see the block at the bottom of
   webflow-footer.html. Saves the push-wait-reload loop entirely:
   every response is no-store, so a plain browser reload always
   runs the file currently on disk.

   Chrome treats http://localhost as a trustworthy origin, so an
   https Webflow page loads it without a mixed-content block.
   Safari and Firefox do not — use Chrome for this, or the site
   simply runs without the script.

   No dependencies on purpose. This repo has no build step and no
   package.json, and adding npm install to a one-file project is
   not worth the moving parts.
   ============================================================ */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 5173;
const ROOT = __dirname;

const TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  /* The site loading this is on another origin (webflow.io), so the
     script tag needs CORS to even report errors usefully, and SRI or
     any future module import would need it outright. */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? '/page-transition.js' : urlPath;

  /* Resolve first, then check the result is still inside ROOT. A
     ../ in the URL is otherwise a straight read of the whole disk,
     and this listens on a real port. */
  const file = path.resolve(ROOT, '.' + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found: ' + rel);
      console.log('404', rel);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
    console.log('200', rel, body.length + 'b');
  });
});

server.listen(PORT, () => {
  console.log(`[dev] serving ${ROOT}`);
  console.log(`[dev] http://localhost:${PORT}/page-transition.js`);
  console.log(`[dev] http://localhost:${PORT}/page-transition.css`);
  console.log('[dev] no-store, so a plain reload always gets the file on disk');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[dev] port ${PORT} is taken — node dev-server.js ${PORT + 1}`);
    process.exit(1);
  }
  throw err;
});

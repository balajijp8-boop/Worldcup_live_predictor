/* =============================================================================
 * proxy/server.js — Tiny zero-dependency CORS proxy
 * -----------------------------------------------------------------------------
 * Browsers block direct cross-origin calls to these APIs. Run this and point
 * CONFIG.PROXY_URL at it:  PROXY_URL: 'http://localhost:8787/'
 *
 *   node proxy/server.js
 *
 * Proxies football-data.org (fixtures/scores) AND api-sports.io (player data),
 * forwarding their auth headers and adding permissive CORS. Node 18+ (fetch).
 * ========================================================================== */

const http = require('http');

const PORT = process.env.PORT || 8787;
const ALLOWED = ['https://api.football-data.org', 'https://v3.football.api-sports.io'];

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Auth-Token, x-apisports-key, Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // Expect the real URL, percent-encoded, as the path after "/".
  const target = decodeURIComponent(req.url.slice(1));
  if (!ALLOWED.some(h => target.startsWith(h))) {
    res.writeHead(400); return res.end('Host not allowed by proxy.');
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'X-Auth-Token': req.headers['x-auth-token'] || '',
        'x-apisports-key': req.headers['x-apisports-key'] || '',
      },
    });
    const body = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(body);
  } catch (err) {
    res.writeHead(502);
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => console.log(`CORS proxy on http://localhost:${PORT}/`));

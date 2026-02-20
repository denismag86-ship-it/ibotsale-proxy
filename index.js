/**
 * iBotSale AI Proxy — Fly.io US datacenter
 * Forwards requests to geo-restricted APIs (OpenAI, Anthropic, Meta, Instagram)
 *
 * Routes:
 *   /openai/v1/*    → api.openai.com
 *   /anthropic/v1/* → api.anthropic.com
 *   /deepseek/v1/*  → api.deepseek.com
 *   /kimi/v1/*      → api.moonshot.cn
 *   /instagram/*    → graph.instagram.com
 *   /facebook/*     → graph.facebook.com
 *   /ig-private/*   → i.instagram.com  (instagram-private-api)
 *   /threads/*      → www.threads.net
 *   /health         → status check
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const SECRET = process.env.PROXY_SECRET; // Optional: bearer token protection

const ROUTES = {
  '/openai':    'https://api.openai.com',
  '/anthropic': 'https://api.anthropic.com',
  '/deepseek':  'https://api.deepseek.com',
  '/kimi':      'https://api.moonshot.cn',
  '/telegram':  'https://api.telegram.org',
  '/instagram': 'https://graph.instagram.com',
  '/facebook':  'https://graph.facebook.com',
  '/ig-private':'https://i.instagram.com',
  '/threads':   'https://www.threads.net',
};

function findRoute(pathname) {
  for (const [prefix, target] of Object.entries(ROUTES)) {
    if (pathname.startsWith(prefix)) {
      return { prefix, target };
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', region: process.env.FLY_REGION || 'unknown' }));
    return;
  }

  // Optional auth
  if (SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  const route = findRoute(req.url);
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown route', url: req.url }));
    return;
  }

  // Strip prefix, build target URL
  const targetPath = req.url.slice(route.prefix.length) || '/';
  const targetUrl = new URL(targetPath, route.target);

  const options = {
    hostname: targetUrl.hostname,
    port: 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.hostname,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy] Error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
    }
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`[Proxy] Listening on port ${PORT}`);
  console.log(`[Proxy] Routes: ${Object.keys(ROUTES).join(', ')}`);
});

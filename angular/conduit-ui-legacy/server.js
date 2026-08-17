// Express-free production server for the built Angular conduit-ui-legacy dist folder.
// API routes are proxied to conduit-mcp (port 3100) — see proxy.conf.json.
// Uses Node.js built-in http + https modules to avoid Express 5 / path-to-regexp
// compatibility issues with catch-all routes and http-proxy-middleware.

const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.PORT, 10) || 4015;
const CONDUIT_MCP_PORT = 3100;
const CONDUIT_MCP_HOST = 'localhost';
const CONDUIT_SRV_PORT = 3104;
const CONDUIT_SRV_HOST = 'localhost';
const TACKLE_SRV_PORT = 3410;
const TACKLE_SRV_HOST = 'localhost';

const DIST_DIR = path.join(__dirname, 'dist', 'conduit-ui', 'browser');

// Routes proxied to conduit-mcp (3100) — MCP-native, SSE, runtime-kernel, validation-dependent
// Note: /tickets is split — detect & lineage go to conduit-srv (specific paths in SRV_PREFIXES),
// while supersede & cancel stay on conduit-mcp (matched by the /tickets prefix here).
const API_PREFIXES = [
  '/tools', '/state', '/events',
  '/sessions', '/health',
  '/plans', '/circuit-breaker', '/conduit', '/agents',
  '/tickets',
];

// Routes proxied to tackle-srv (3410) — AI config registry (providers/harnesses/
// models/roles/prompts/tool-access) + role provisioning. Checked BEFORE
// SRV_PREFIXES so /config/ai wins over the /config → conduit-srv rule.
const TACKLE_PREFIXES = [
  '/config/ai', '/roles', '/memory', '/prompts',
];

// Routes proxied to conduit-srv (3104) — pure-DB REST (extracted from conduit-mcp)
// Checked BEFORE API_PREFIXES so specific paths like /tickets/detect win over /tickets.
const SRV_PREFIXES = [
  '/config', '/log', '/tokens',
  '/workflows', '/governance', '/vision',
  '/tickets/detect', '/tickets/lineage',
];

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/octet-stream',
};

function isApiPath(urlPath) {
  return API_PREFIXES.some(prefix => urlPath === prefix || urlPath.startsWith(prefix + '/'));
}

function isSrvPath(urlPath) {
  return SRV_PREFIXES.some(prefix => urlPath === prefix || urlPath.startsWith(prefix + '/'));
}

function isTacklePath(urlPath) {
  return TACKLE_PREFIXES.some(prefix => urlPath === prefix || urlPath.startsWith(prefix + '/'));
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // File not found — serve index.html as SPA fallback
      const indexPath = path.join(DIST_DIR, 'index.html');
      fs.readFile(indexPath, (err2, data2) => {
        if (err2) {
          res.writeHead(500);
          res.end('Internal server error');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function proxyToMcp(req, res) {
  proxyTo(req, res, CONDUIT_MCP_HOST, CONDUIT_MCP_PORT);
}

function proxyToSrv(req, res) {
  proxyTo(req, res, CONDUIT_SRV_HOST, CONDUIT_SRV_PORT);
}

function proxyToTackle(req, res) {
  proxyTo(req, res, TACKLE_SRV_HOST, TACKLE_SRV_PORT);
}

function proxyTo(req, res, host, port) {
  const options = {
    hostname: host,
    port: port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${host}:${port}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Forward the response status and headers as-is (browser handles decompression)
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[conduit-ui-legacy] Proxy error for ${req.url}:`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad gateway', message: err.message }));
  });

  // Pipe the request body to the proxy target
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  // Parse pathname from the raw URL (avoids dependency on req.headers.host)
  const qIndex = req.url.indexOf('?');
  const urlPath = qIndex >= 0 ? req.url.slice(0, qIndex) : req.url;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (isTacklePath(urlPath)) {
    return proxyToTackle(req, res);
  }

  if (isSrvPath(urlPath)) {
    return proxyToSrv(req, res);
  }

  if (isApiPath(urlPath)) {
    return proxyToMcp(req, res);
  }

  // Serve static files from dist
  const filePath = urlPath === '/'
    ? path.join(DIST_DIR, 'index.html')
    : path.join(DIST_DIR, urlPath);

  serveStatic(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[conduit-ui-legacy] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[conduit-ui-legacy] Proxying MCP routes to ${CONDUIT_MCP_HOST}:${CONDUIT_MCP_PORT}`);
  console.log(`[conduit-ui-legacy] Proxying REST routes to ${CONDUIT_SRV_HOST}:${CONDUIT_SRV_PORT}`);
  console.log(`[conduit-ui-legacy] Proxying tackle routes to ${TACKLE_SRV_HOST}:${TACKLE_SRV_PORT}`);
});


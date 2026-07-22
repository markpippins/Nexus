import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4204;
const API_TARGET = process.env.API_TARGET || 'http://localhost:3107';
const DIST_DIR = path.join(__dirname, 'dist/assembly');

if (!fs.existsSync(DIST_DIR)) {
  console.error(`Error: Build output not found at ${DIST_DIR}. Run "npm run build" first.`);
  process.exit(1);
}

// Proxy API requests per proxy.conf.json
app.use(createProxyMiddleware({
  pathFilter: '/api',
  target: API_TARGET,
  changeOrigin: true,
  logger: process.env.DEBUG_PROXY ? console : { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  on: {
    proxyReq: (proxyReq, req) => {
      console.log('[proxy]', req.method, req.url, '->', proxyReq.path);
    },
  },
}));

// Serve built static files
app.use(express.static(DIST_DIR));

// Fallback for SPA routing (exclude API routes defensively)
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).send('Not found');
    return;
  }
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Assembly UI server running on http://localhost:${PORT}`);
  console.log(`Proxying /api to ${API_TARGET}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '4201', 10);

  app.use(express.json());

  // API Routes for Conduit / Nexus Control Plane
  app.get('/api/status', (req, res) => {
    res.json({
      pgConnected: Boolean(process.env.CONDUIT_PG_DSN),
      pgDsn: process.env.CONDUIT_PG_DSN || 'postgresql://nexus_admin:***@postgres.internal.nexus:5432/nexus (stub)',
      pgSchema: process.env.CONDUIT_PG_SCHEMA || 'conduit',
      wrpKernelActive: true,
      wrpKernelUrl: process.env.WRP_KERNEL_URL || 'http://localhost:3103',
      mcpServerUrl: process.env.MCP_BASE_URL || 'http://localhost:3100',
      activeLeasesCount: 3,
      circuitBreakerTripped: false,
      lastSyncTimestamp: new Date().toISOString(),
    });
  });

  app.get('/api/healthz', (req, res) => {
    res.json({ status: 'healthy', version: '2.4.0-nexus' });
  });

  // Vite middleware for dev or static server in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Conduit Control Plane server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

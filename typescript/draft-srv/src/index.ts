/**
 * draft-srv — Draft service workspace.
 *
 * Hosts new backend components pending promotion to dedicated services.
 * Current tenant: DB Workbench API (multi-engine browse + query/DDL execution
 * backing nexus/angular/data-explorer-ui).
 *
 * Env:
 *   PORT            — listen port (default 3170)
 *   CORS_ORIGINS    — comma-separated allowed origins (default: loopback UIs)
 *   NEXUS_INTERNAL_SECRET — fleet-internal shared secret (required; fail-closed)
 */
import express from 'express';
import cors from 'cors';
import { dbWorkbenchRoutes } from './routes/db';
import { listCapabilities } from './drivers/registry';

const PORT = Number(process.env.PORT) || 3170;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:4212,http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) return cb(null, true);
        return cb(null, false); // no-Origin (curl/same-origin) and allowlisted pass; others silent-deny
      },
    })
  );

  // Heartbeat registration with the service-registry (8085). The numeric
  // serviceId is assigned when draft-srv is registered; set DRAFT_SRV_REGISTRY_ID
  // in the unit env after registration. Fails soft when absent/down.
  const serviceId = Number(process.env.DRAFT_SRV_REGISTRY_ID);
  if (serviceId) {
    try {
      const { startHeartbeat } = await import('@nexus/heartbeat-client');
      startHeartbeat({
        serviceId,
        serviceName: 'draft-srv',
        interval: 30,
        log: (...args: any[]) => console.log(new Date().toISOString(), '[heartbeat draft-srv]', ...args),
      });
    } catch {
      console.warn('[draft-srv] heartbeat-client unavailable — continuing without liveness registration');
    }
  } else {
    console.warn('[draft-srv] DRAFT_SRV_REGISTRY_ID not set — skipping heartbeat registration');
  }

  // Security Pass Alpha (audit C1, decision 22fe12bc): internal-only surface.
  // Loopback bind + mandatory X-Nexus-Internal fleet secret on every route
  // except the liveness probe. Fail-closed if the secret is not configured.
  const NEXUS_INTERNAL_SECRET = process.env.NEXUS_INTERNAL_SECRET;
  app.use((req, res, next) => {
    if (!NEXUS_INTERNAL_SECRET) {
      console.error('[draft-srv] NEXUS_INTERNAL_SECRET not set — refusing requests (fail-closed)');
      return res.status(503).json({ error: 'service misconfigured: missing internal secret' });
    }
    if (req.path === '/api/health') return next();
    if (req.get('X-Nexus-Internal') === NEXUS_INTERNAL_SECRET) return next();
    console.warn(
      `[draft-srv] rejected ${req.method} ${req.path} from ${req.ip} (missing/invalid X-Nexus-Internal)`
    );
    return res.status(403).json({ error: 'forbidden' });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'draft-srv',
      component: 'db-workbench',
      engines: listCapabilities(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', dbWorkbenchRoutes());

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[draft-srv] listening on http://localhost:${PORT} (engines: ${listCapabilities().map((c) => `${c.id}:${c.available ? 'on' : 'off'}`).join(', ')})`);
  });
}

startServer().catch((err) => {
  console.error('[draft-srv] fatal:', err);
  process.exit(1);
});

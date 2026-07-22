import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createRoutes } from './routes';
import { startNotifyListener, isNotifyAlive, subscribe, stopNotifyListener } from './notify';

// ── PostgreSQL Connection ──────────────────────────────────────────
// Same convention as nebula-srv. We do NOT set search_path here so
// every SQL in routes.ts is explicit (kernel.*) — kernel is co-equal
// with nebula, not the default.
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'pguser',
  password: 'pgpass',
  database: 'nexus',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ── SSE subscriber registry (so /health can report it) ────────────
let subscriberCount = 0;
export function incSubscriber(): number {
  subscriberCount++;
  return subscriberCount;
}
export function decSubscriber(): number {
  subscriberCount = Math.max(0, subscriberCount - 1);
  return subscriberCount;
}
export function getSubscriberCount(): number {
  return subscriberCount;
}

// ── pg_notify listener ─────────────────────────────────────────────
startNotifyListener(pool);

// Re-export subscribe so routes.ts can register SSE clients without
// re-implementing the EventEmitter wiring.
export { subscribe };

// ── Express Setup ──────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8100;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/kernel', createRoutes(pool, { subscribe, incSubscriber, decSubscriber }));

// ── Health Check ───────────────────────────────────────────────────
async function healthHandler(_req: express.Request, res: express.Response) {
  try {
    const { rows } = await pool.query('SELECT 1 as ok');
    res.json({
      status: 'ok',
      db: rows[0].ok === 1,
      pgNotify: isNotifyAlive(),
      subscribers: getSubscriberCount(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ status: 'error', message: msg });
  }
}

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`kernel-srv listening on http://localhost:${PORT}`);
});

// ── Graceful shutdown ──────────────────────────────────────────────
async function shutdown(): Promise<void> {
  console.log('[server] shutting down...');
  server.close();
  await stopNotifyListener();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

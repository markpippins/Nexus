import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createRoutes } from './routes';
import { startHeartbeat } from 'heartbeat-client';

// ── PostgreSQL Connection ──────────────────────────────────────────
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'pguser',
  password: 'pgpass',
  database: 'nexus',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ── Express Setup ──────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT || '3125', 10);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── API Routes ────────────────────────────────────────────────────
app.use('/api', createRoutes(pool));

// ── Health Check ───────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT 1 as ok');
    res.json({ ok: rows[0].ok === 1, service: 'ui-tools' });
  } catch (err: any) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`ui-tools listening on http://localhost:${PORT}`);

  startHeartbeat({
    serviceId: 121,
    serviceName: 'ui-tools',
    interval: 30,
    log: (...args: any[]) => console.log(new Date().toISOString(), '[heartbeat ui-tools]', ...args),
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ui-tools: port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    console.error('ui-tools: listen error:', err.message);
  }
  process.exit(1);
});

process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ui-tools: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[ui-tools] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[ui-tools] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

// ── Graceful shutdown ──────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[ui-tools] SIGTERM received, shutting down...');
  await pool.end();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('[ui-tools] SIGINT received, shutting down...');
  await pool.end();
  server.close(() => process.exit(0));
});

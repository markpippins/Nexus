import express from 'express';
import cors from 'cors';
import { createRoutes } from './routes';
import { pool } from './db';

// ── Heartbeat client ──────────────────────────────────────────────
import { startHeartbeat } from 'heartbeat-client';

// ── Express Setup ──────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3114;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── API Routes ────────────────────────────────────────────────────
app.use('/api', createRoutes(pool));

// ── Health Check ───────────────────────────────────────────────────
async function healthHandler(_req: express.Request, res: express.Response) {
  try {
    const { rows } = await pool.query('SELECT 1 as ok');
    res.json({ status: 'ok', db: rows[0].ok === 1, service: 'voyager-srv' });
  } catch (err: any) {
    res.status(503).json({ status: 'error', message: err.message });
  }
}

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`voyager-srv listening on http://localhost:${PORT}`);

  // Register with service-registry (port 8085) via heartbeat-client.
  // serviceId 114 = voyager-srv (100 + port % 100).
  startHeartbeat({
    serviceId: 114,
    serviceName: 'voyager-srv',
    interval: 30,
    log: (...args: any[]) => console.log(new Date().toISOString(), '[heartbeat voyager-srv]', ...args),
  });
});

// Handle listen-time errors (e.g. EADDRINUSE) cleanly
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`voyager-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    console.error('voyager-srv: listen error:', err.message);
  }
  process.exit(1);
});

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`voyager-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[process] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[process] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

process.on('unhandledRejection', (reason: any) => {
  const code = reason?.code;
  if (code === 'EPIPE' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') {
    console.warn('[process] unhandledRejection (connection noise):', code, reason?.message ?? '');
    return;
  }
  console.error('[process] unhandledRejection:', reason?.message ?? require('util').inspect(reason, { depth: 2 }));
  if (reason?.stack) {
    console.error('[process]   stack:', reason.stack.split('\n').slice(0, 4).join('\n'));
  }
});

// ── Graceful shutdown ──────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received, shutting down...');
  await pool.end();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('[server] SIGINT received, shutting down...');
  await pool.end();
  server.close(() => process.exit(0));
});

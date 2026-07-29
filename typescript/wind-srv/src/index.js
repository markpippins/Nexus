import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { routes } from './routes/index.js';
import { errorHandler } from './error-handler.js';

dotenv.config({ path: '../../.env' });
dotenv.config({ path: '.env' });

const app = express();
const PORT = process.env.WIND_SRV_PORT || 3300;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', async (_req, res) => {
  try {
    const { pool } = await import('./db.js');
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ ok: true, schema: 'wind' });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// API routes
app.use('/api', routes);

// Error handler
app.use(errorHandler);

// ── Process-level safety net ─────────────────────────────────────
// Prevent unhandled errors from crashing the process.
// Connection noise (EPIPE, ECONNRESET, ETIMEDOUT) is logged and
// suppressed. Other unhandled exceptions are logged but the process
// continues — this is a last-resort safety net; route handlers
// should still use their own try/catch.
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[wind-srv] port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[wind-srv] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[wind-srv] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

// ── Shutdown coordinator ────────────────────────────────────────
const cleanupHandlers = [];

function registerCleanup(fn) {
  cleanupHandlers.push(fn);
}

async function shutdown(signal) {
  console.log(`[wind-srv] ${signal} received — shutting down background services`);
  for (const fn of cleanupHandlers) {
    try { fn(); } catch (_) { /* best-effort */ }
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[wind-srv] listening on http://localhost:${PORT}`);
  console.log(`[wind-srv] endpoints: /api/offices, /api/titles, /api/tasks, /api/outcomes,`);
  console.log(`  /api/workflows, /api/versions, /api/nodes, /api/edges,`);
  console.log(`  /api/instances, /api/tickets, /api/receipts, /api/validate, /api/v-roles,`);
  console.log(`  /api/events, /api/event-types`);

  // ── Background Services ──────────────────────────────────────

  // Start the event processor (polls unconsumed events every 5s)
  import('./event-processor.js').then(({ startEventProcessor }) => {
    registerCleanup(startEventProcessor());
    console.log('[wind-srv] Event processor started');
  }).catch(err => {
    console.error('[wind-srv] Failed to start event processor:', err.message);
  });

  // Start the Rover scheduler (fires immediately, then every 30 min)
  import('./scheduler.js').then(({ startRoverScheduler }) => {
    registerCleanup(startRoverScheduler());
    console.log('[wind-srv] Rover scheduler started');
  }).catch(err => {
    console.error('[wind-srv] Failed to start Rover scheduler:', err.message);
  });

  // Start the NATS listener (real-time event subscription)
  import('./nats-listener.js').then(async ({ startNatsListener }) => {
    registerCleanup(await startNatsListener());
    console.log('[wind-srv] NATS listener started');
  }).catch(err => {
    console.error('[wind-srv] Failed to start NATS listener:', err.message);
  });
});

// Handle listen-time errors (e.g. EADDRINUSE) cleanly.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[wind-srv] port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    console.error('[wind-srv] listen error:', err.message);
  }
  process.exit(1);
});

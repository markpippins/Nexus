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

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[wind-srv] listening on http://localhost:${PORT}`);
  console.log(`[wind-srv] endpoints: /api/offices, /api/titles, /api/tasks, /api/outcomes,`);
  console.log(`  /api/workflows, /api/versions, /api/nodes, /api/edges,`);
  console.log(`  /api/instances, /api/tickets, /api/receipts, /api/validate, /api/v-roles`);
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

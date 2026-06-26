import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createRoutes } from './routes';
import { initRedis, closeRedis } from './services/block-segmentation-redis.service';

// ── PostgreSQL Connection ──────────────────────────────────────────
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'pguser',
  password: 'pgpass',
  database: 'nexus',
  options: '-c search_path=nebula',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ── Express Setup ──────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3101;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── API Routes ────────────────────────────────────────────────────
app.use('/api', createRoutes(pool));

// ── Health Check ───────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT 1 as ok');
    res.json({ status: 'ok', db: rows[0].ok === 1 });
  } catch (err: any) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// ── Redis init ──────────────────────────────────────────────────────
try {
  initRedis();
  console.log('[redis] block-segmentation client initialized (lazy connect)');
} catch (err: any) {
  console.warn('[redis] block-segmentation init failed (non-fatal):', err.message);
}

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`nebula-srv listening on http://localhost:${PORT}`);
});

// ── Graceful shutdown ──────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received, shutting down...');
  await closeRedis();
  await pool.end();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('[server] SIGINT received, shutting down...');
  await closeRedis();
  await pool.end();
  server.close(() => process.exit(0));
});

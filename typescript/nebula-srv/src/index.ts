import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createRoutes } from './routes';

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

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`nebula-srv listening on http://localhost:${PORT}`);
});

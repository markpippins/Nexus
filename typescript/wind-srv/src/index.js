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

app.listen(PORT, () => {
  console.log(`[wind-srv] listening on http://localhost:${PORT}`);
  console.log(`[wind-srv] endpoints: /api/offices, /api/titles, /api/tasks, /api/outcomes,`);
  console.log(`  /api/workflows, /api/versions, /api/nodes, /api/edges,`);
  console.log(`  /api/instances, /api/tickets, /api/receipts, /api/validate, /api/v-roles`);
});

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { routes } from './routes';
import { pool } from './db';

dotenv.config({ path: '../../.env' });
dotenv.config({ path: '.env' });

const app = express();
const PORT = process.env.AEGIS_SRV_PORT ? parseInt(process.env.AEGIS_SRV_PORT) : 3116;
let server: any;

// ── Graceful shutdown ────────────────────────────────────────────
function shutdown(sig: string) {
  console.log(`aegis-srv: ${sig} received, shutting down gracefully`);
  const force = setTimeout(() => {
    console.error('aegis-srv: graceful shutdown timed out, forcing exit');
    process.exit(0);
  }, 8000);
  force.unref();
  const finish = () => {
    pool.end().then(() => process.exit(0)).catch(() => process.exit(0));
  };
  if (server) server.close(finish);
  else finish();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`aegis-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT') {
    console.warn('[aegis-srv] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[aegis-srv] uncaughtException:', err?.message);
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'aegis-srv' }));

app.use('/api', routes);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'not found' }));

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[aegis-srv] handler error:', err?.message);
  res.status(500).json({ error: 'internal server error', message: err?.message });
});

async function main() {
  // Verify the aegis schema is reachable before serving traffic.
  try {
    await pool.query('SELECT 1 FROM aegis.registry LIMIT 1');
  } catch (err: any) {
    console.error('[aegis-srv] FATAL: cannot reach aegis schema:', err?.message);
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    console.log(`aegis-srv listening on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(`aegis-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error('aegis-srv: listen error:', err?.message);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('aegis-srv startup failed:', err?.message);
  process.exit(1);
});
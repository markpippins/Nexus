import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { routes } from './routes/index.js';
import { errorHandler } from './error-handler.js';
import { startHeartbeat } from 'heartbeat-client';
import { runMigration, pool } from './db.js';

dotenv.config({ path: '../../.env' });
dotenv.config({ path: '.env' });

const app = express();
const PORT = process.env.ASSEMBLY_SRV_PORT || 3107;
let server;

// ── Graceful shutdown ────────────────────────────────────────────
// Without this, node never exits on SIGTERM (open server + pg pool keep
// the event loop alive) and systemd waits ~90s for TimeoutStopSec before
// SIGKILL — every restart/deploy appears to hang.
function shutdown(sig) {
  console.log(`assembly-srv: ${sig} received, shutting down gracefully`);
  const force = setTimeout(() => {
    console.error('assembly-srv: graceful shutdown timed out, forcing exit');
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

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`assembly-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[assembly-srv] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[assembly-srv] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', routes);

app.use(errorHandler);

async function main() {
  await runMigration();
  server = app.listen(PORT, () => {
    console.log(`assembly-srv listening on http://localhost:${PORT}`);

    startHeartbeat({
      serviceId: 110,
      serviceName: 'assembly-srv',
      interval: 30,
      log: (...args) => console.log(new Date().toISOString(), '[heartbeat assembly-srv]', ...args),
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`assembly-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error('assembly-srv: listen error:', err.message);
    }
    process.exit(1);
  });
}

main().catch(err => {
  console.error('assembly-srv startup failed:', err);
  process.exit(1);
});

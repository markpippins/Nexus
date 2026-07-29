import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { routes } from './routes/index.js';
import { errorHandler } from './error-handler.js';
import { runMigration } from './db.js';

dotenv.config({ path: '../../.env' });
dotenv.config({ path: '.env' });

const app = express();
const PORT = process.env.ASSEMBLY_SRV_PORT || 3107;

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
  const server = app.listen(PORT, () => {
    console.log(`assembly-srv listening on http://localhost:${PORT}`);
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

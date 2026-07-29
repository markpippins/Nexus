import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { routes } from './routes/index.js';
import { errorHandler, notFoundHandler } from './error-handler.js';
import { dsnInfo } from './db.js';

dotenv.config({ path: '../../.env' });
dotenv.config({ path: '.env' });

const app = express();
const PORT = process.env.PEB_SRV_PORT || 3111;

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`peb-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[peb-srv] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[peb-srv] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, dsn: dsnInfo, port: PORT }));

app.use('/api/peb', routes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`peb-srv listening on http://localhost:${PORT}  (dsn: ${dsnInfo})`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`peb-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    console.error('peb-srv: listen error:', err.message);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('[peb-srv] SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  console.log('[peb-srv] SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

export { app, server };

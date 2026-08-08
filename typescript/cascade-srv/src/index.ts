import express from 'express';
import cors from 'cors';
import routes from './routes';

const PORT = parseInt(process.env.PORT || '3106');

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`cascade-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[cascade-srv] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[cascade-srv] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

const app = express();

app.use(cors());
app.use(express.json());

// Mount all cascade routes at /cascade
app.use('/cascade', routes);

// Root health check
app.get('/', (_req, res) => {
  res.json({ name: 'cascade-srv', version: '1.0.0', port: PORT });
});

const server = app.listen(PORT, () => {
  console.log(`cascade-srv listening on http://localhost:${PORT}`);
  console.log(`  Events API: http://localhost:${PORT}/cascade/events`);
  console.log(`  Analytics:  http://localhost:${PORT}/cascade/analytics`);
  console.log(`  Lineage:    http://localhost:${PORT}/cascade/lineage`);
  console.log(`  Health:     http://localhost:${PORT}/cascade/health`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`cascade-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    console.error('cascade-srv: listen error:', err.message);
  }
  process.exit(1);
});

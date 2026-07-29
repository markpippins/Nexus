import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { startHeartbeat } from 'heartbeat-client';

// ── Types ─────────────────────────────────────────────────────────
interface UiEvent {
  sender: string;
  eventName: string;
  eventValue: unknown;
}

interface SseClient {
  id: string;
  sender: string;
  res: express.Response;
  connectedAt: Date;
}

// ── In-memory SSE client registry ─────────────────────────────────
const clients = new Map<string, SseClient>();

// ── Express Setup ─────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3200;

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ui-event-bus: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[ui-event-bus] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[ui-event-bus] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

app.use(cors());
app.use(express.json({ limit: '256kb' }));

// ── POST /api/events — receive and broadcast ──────────────────────
app.post('/api/events', (req, res) => {
  const { sender, eventName, eventValue } = req.body as Partial<UiEvent>;

  if (!sender || !eventName) {
    res.status(400).json({ error: 'sender and eventName are required' });
    return;
  }

  const event: UiEvent = { sender, eventName, eventValue };

  // Broadcast to all SSE clients EXCEPT the sender (self-event filtering)
  let sent = 0;
  for (const client of clients.values()) {
    if (client.sender === sender) continue;
    try {
      client.res.write(`data: ${JSON.stringify(event)}\n\n`);
      sent++;
    } catch {
      // Client disconnected — clean up on next tick
      clients.delete(client.id);
    }
  }

  console.log(`[event] ${sender} → ${eventName} (broadcast to ${sent} clients)`);
  res.json({ ok: true, sent });
});

// ── GET /api/events/stream — SSE endpoint ─────────────────────────
app.get('/api/events/stream', (req, res) => {
  const sender = (req.query.sender as string) || 'unknown';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial connection acknowledgement
  res.write(`data: ${JSON.stringify({ sender: '_system', eventName: 'connected', eventValue: { clientSender: sender } })}\n\n`);

  const clientId = randomUUID();
  const client: SseClient = { id: clientId, sender, res, connectedAt: new Date() };
  clients.set(clientId, client);

  console.log(`[sse] client connected: ${clientId} (sender=${sender}) — total: ${clients.size}`);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      clients.delete(clientId);
    }
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
    console.log(`[sse] client disconnected: ${clientId} — total: ${clients.size}`);
  });
});

// ── GET /api/events/clients — list connected clients (debug) ──────
app.get('/api/events/clients', (_req, res) => {
  const list = Array.from(clients.values()).map(c => ({
    id: c.id,
    sender: c.sender,
    connectedAt: c.connectedAt,
  }));
  res.json({ count: list.length, clients: list });
});

// ── DELETE /api/events/clients/:id — disconnect a client ──────────
app.delete('/api/events/clients/:id', (req, res) => {
  const client = clients.get(req.params.id);
  if (!client) {
    res.status(404).json({ error: 'client not found' });
    return;
  }
  client.res.end();
  clients.delete(client.id);
  res.json({ ok: true });
});

// ── Health Check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', connectedClients: clients.size });
});

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`ui-event-bus listening on http://localhost:${PORT}`);
  console.log(`  POST /api/events          — publish an event`);
  console.log(`  GET  /api/events/stream    — SSE subscription (?sender=xxx)`);
  console.log(`  GET  /api/events/clients   — list connected clients`);
  console.log(`  GET  /health               — health check`);

  startHeartbeat({
    serviceId: 120,
    serviceName: 'ui-event-bus',
    interval: 30,
    log: (...args: any[]) => console.log(new Date().toISOString(), '[heartbeat ui-event-bus]', ...args),
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ui-event-bus: port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    console.error('ui-event-bus: listen error:', err.message);
  }
  process.exit(1);
});

// ── Graceful Shutdown ─────────────────────────────────────────────
function shutdown() {
  console.log('[server] shutting down...');
  for (const client of clients.values()) {
    try { client.res.end(); } catch { /* ignore */ }
  }
  clients.clear();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

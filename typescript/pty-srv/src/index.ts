import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import * as http from 'http';
import { startHeartbeat } from 'heartbeat-client';

const PORT = parseInt(process.env.PTY_SRV_PORT || '3120');

// ── WebSocket server ───────────────────────────────────────────────────

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

const shellPath = process.env.SHELL || '/bin/bash';

console.log(`pty-srv starting on ws://localhost:${PORT}`);
console.log(`  shell: ${shellPath}`);

wss.on('connection', (ws: WebSocket) => {
  console.log(`[session] new connection`);

  const shellProcess = pty.spawn(shellPath, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/home/codex',
    env: { ...(process.env as Record<string, string>), TERM: 'xterm-256color' },
  });

  shellProcess.onData((data: string) => {
    try {
      ws.send(data);
    } catch {
      // client disconnected
    }
  });

  shellProcess.onExit(({ exitCode }: { exitCode: number; signal?: number }) => {
    console.log(`[session] shell exited (code=${exitCode})`);
    try {
      ws.close();
    } catch {
      // ignore
    }
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input' && typeof msg.data === 'string') {
        shellProcess.write(msg.data);
      } else if (msg.type === 'resize') {
        shellProcess.resize(msg.cols ?? 80, msg.rows ?? 24);
      }
    } catch {
      shellProcess.write(raw.toString());
    }
  });

  ws.on('close', () => {
    console.log(`[session] client disconnected`);
    try { shellProcess.kill(); } catch { /* ignore */ }
  });

  ws.on('error', () => {
    try { shellProcess.kill(); } catch { /* ignore */ }
  });
});

// ── Health endpoint ────────────────────────────────────────────────────

const healthServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', backend: 'direct' }));
});

healthServer.listen(PORT + 1, '127.0.0.1', () => {
  console.log(`pty-srv health check on http://localhost:${PORT + 1}/`);

  startHeartbeat({
    serviceId: 115,
    serviceName: 'pty-srv',
    interval: 30,
    log: (...args: any[]) => console.log(new Date().toISOString(), '[heartbeat pty-srv]', ...args),
  });
});

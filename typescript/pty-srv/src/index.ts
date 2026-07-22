import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import { execSync } from 'child_process';
import * as http from 'http';

const PORT = parseInt(process.env.PTY_SRV_PORT || '3120');
const CLEANUP_TIMEOUT_MS = parseInt(process.env.PTY_CLEANUP_TIMEOUT || '300000'); // 5 min default

interface PtyMessage {
  type: 'input' | 'resize';
  data?: string;
  cols?: number;
  rows?: number;
}

// ── Session tracking ───────────────────────────────────────────────────

interface TrackedSession {
  sessionId: string;
  cleanupTimer: NodeJS.Timeout | null;
  ptyProcess: pty.IPty | null;
  attachedClients: number;
}

const sessions = new Map<string, TrackedSession>();

/** Check if a tmux session exists by name */
function tmuxSessionExists(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${escapeSessionName(name)} 2>/dev/null`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/** Escape a session name for shell use — only allow alphanumeric, dash, underscore */
function escapeSessionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '');
}

/** Kill a tmux session and remove from tracking */
function killTmuxSession(sessionId: string): void {
  const safeName = escapeSessionName(sessionId);
  try {
    execSync(`tmux kill-session -t ${safeName} 2>/dev/null`, { timeout: 2000 });
    console.log(`[session] killed tmux session ${safeName}`);
  } catch {
    // already gone
  }
  sessions.delete(sessionId);
}

/** Start or reset the cleanup timer for a session */
function scheduleCleanup(sessionId: string): void {
  const tracked = sessions.get(sessionId);
  if (!tracked) return;

  // Clear existing timer
  if (tracked.cleanupTimer) {
    clearTimeout(tracked.cleanupTimer);
  }

  // Schedule new cleanup
  tracked.cleanupTimer = setTimeout(() => {
    const s = sessions.get(sessionId);
    if (s && s.attachedClients <= 0) {
      console.log(`[session] cleanup timeout for ${sessionId}`);
      // Kill the PTY process (tmux client)
      if (s.ptyProcess) {
        try { s.ptyProcess.kill(); } catch { /* ignore */ }
      }
      // Kill the tmux session
      killTmuxSession(sessionId);
    }
  }, CLEANUP_TIMEOUT_MS);
}

// ── WebSocket server ───────────────────────────────────────────────────

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

console.log(`pty-srv (tmux) starting on ws://localhost:${PORT}`);
console.log(`  cleanup timeout: ${CLEANUP_TIMEOUT_MS / 1000}s`);

wss.on('connection', (ws: WebSocket, req) => {
  // Parse session ID from query string
  let sessionId = '';
  try {
    const url = new URL(req.url || '/', 'ws://localhost');
    sessionId = escapeSessionName(url.searchParams.get('session') || '');
  } catch {
    sessionId = '';
  }

  if (!sessionId) {
    sessionId = `tmux-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    console.log(`[session] generated new id: ${sessionId}`);
  }

  const exists = tmuxSessionExists(sessionId);
  const tmuxArgs = exists
    ? ['attach-session', '-d', '-t', sessionId]
    : ['new-session', '-s', sessionId];

  console.log(`[session] ${sessionId} — ${exists ? 'REATTACH' : 'CREATE'}`);

  // Cancel any pending cleanup for this session
  const existing = sessions.get(sessionId);
  if (existing?.cleanupTimer) {
    clearTimeout(existing.cleanupTimer);
    existing.cleanupTimer = null;
  }

  const shellProcess = pty.spawn('tmux', tmuxArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/home/codex',
    env: { ...(process.env as Record<string, string>), TERM: 'xterm-256color' },
  });

  // Track this session
  const tracked: TrackedSession = existing || {
    sessionId,
    cleanupTimer: null,
    ptyProcess: null,
    attachedClients: 0,
  };
  tracked.ptyProcess = shellProcess;
  tracked.attachedClients++;
  sessions.set(sessionId, tracked);

  shellProcess.onData((data: string) => {
    try {
      ws.send(data);
    } catch {
      // client disconnected
    }
  });

  shellProcess.onExit(({ exitCode }: { exitCode: number; signal?: number }) => {
    console.log(`[session] ${sessionId} — tmux client exited (code=${exitCode})`);
    tracked.attachedClients--;

    try {
      ws.send(`\r\n\x1b[33m[tmux detached — session ${sessionId} still alive. Reconnect to resume.]\x1b[0m\r\n`);
    } catch {
      // ignore
    }

    // If no clients remain, start cleanup timer
    if (tracked.attachedClients <= 0) {
      scheduleCleanup(sessionId);
    }

    ws.close();
  });

  ws.on('message', (raw) => {
    try {
      const msg: PtyMessage = JSON.parse(raw.toString());
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
    console.log(`[session] ${sessionId} — client disconnected`);
    // Kill the tmux client PTY (detaches the session).
    // onExit handles the attachedClients decrement and cleanup scheduling.
    try { shellProcess.kill(); } catch { /* ignore */ }
  });

  ws.on('error', () => {
    try { shellProcess.kill(); } catch { /* ignore */ }
  });
});

// ── Health endpoint ────────────────────────────────────────────────────

const healthServer = http.createServer((_req, res) => {
  const sessionList = Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    attachedClients: s.attachedClients,
    hasCleanupTimer: !!s.cleanupTimer,
  }));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    backend: 'tmux',
    activeSessions: sessionList.length,
    sessions: sessionList,
  }));
});
healthServer.listen(PORT + 1, '127.0.0.1', () => {
  console.log(`pty-srv health check on http://localhost:${PORT + 1}/`);
});

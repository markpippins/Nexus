import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { PipelineWatcher } from './watcher';
import { registerToolHandlers, toolDefinitions } from './tools';
import { createError, createSuccess } from './errors';
import { getAllSessions, getSession, endSession, updateSessionCost, tripBreaker, clearBreaker, setConduitPaused, getBreaker, getPlanById, upsertPlan, checkpointWal, releaseSessionTickets, resetAbandonedTickets, detectStaleTickets, detectExpiredTickets, supersedeTicket, cancelTicket, getTokenUsageByPlan, getTokenUsageByRole, getTokenUsageByTicket, getTicketLineage, scanOrphanedPlans, getAIConfigSnapshot, getAIProviders, getAIHarnesses, getAIModels, getAIRoleConfigs, upsertAIProvider, upsertAIHarness, upsertAIModel, upsertAIRoleConfig, deleteAIProvider, deleteAIHarness, deleteAIModel, seedDefaultAIConfig } from './db';
import http from 'http';
import { loadEnv } from './env';  // shared .env loader (no dotenv dependency)

// .env already loaded by env.ts at module evaluation time

const PORT = parseInt(process.env.PORT || '3100', 10);
const PIPELINE_DIR =
  process.env.PIPELINE_DIR || path.resolve(__dirname, '../../../../nexus/.conduit-data');

const app = express();
app.use(cors());
app.use(express.json());

// ── MCP JSON-RPC endpoint (POST /) ─────────────────────────────
// Standard MCP protocol via Streamable HTTP transport (rmcp client).
app.post('/', express.json(), async (req, res) => {
  const msg = req.body;
  if (!msg || msg.jsonrpc !== '2.0' || !msg.method) {
    res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null });
    return;
  }

  const { method, params, id } = msg;

  // Notifications have no id — no response expected
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    res.status(202).end();
    return;
  }

  const respond = (result: any) => res.json({ jsonrpc: '2.0', result, id });
  const respondError = (code: number, message: string) => res.json({ jsonrpc: '2.0', error: { code, message }, id });

  try {
    switch (method) {
      case 'initialize':
        respond({
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: 'conduit-mcp',
            version: '1.0.0',
          },
        });
        break;

      case 'tools/list': {
        respond({ tools: toolDefinitions });
        break;
      }

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        if (!name || !toolHandlers[name]) {
          respondError(-32601, `Unknown tool: ${name}`);
          return;
        }
        const result = await toolHandlers[name](args || {});
        respond({ content: [{ type: 'text', text: JSON.stringify(result) }] });
        break;
      }

      case 'resources/list':
        respond({ resources: [] });
        break;

      default:
        respondError(-32601, `Method not found: ${method}`);
    }
  } catch (err: any) {
    console.error(`[MCP] Error in ${method}:`, err.message);
    respondError(-32603, err.message || 'Internal error');
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// SSE clients
interface SSEClient {
  id: number;
  res: express.Response;
}
const sseClients: SSEClient[] = [];
let clientIdCounter = 0;

// Initialize watcher
const watcher = new PipelineWatcher(PIPELINE_DIR);
// Create emitter for tools to emit SSE events (e.g., on receipt issuance)
const toolEmitter = (event: any) => watcher.emitToolEvent(event);
const toolHandlers = registerToolHandlers(watcher, toolEmitter);

// SSE endpoint
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(
    `data: ${JSON.stringify({ type: 'connected', message: 'SSE connected' })}\n\n`,
  );

  // Push full state immediately so reconnecting clients get fresh data
  try {
    const initialState = watcher.getState();
    res.write(
      `data: ${JSON.stringify({ type: 'state_full', data: initialState })}\n\n`,
    );
  } catch {
    // state not ready yet, client will get it on next heartbeat
  }

  const clientId = ++clientIdCounter;
  const client: SSEClient = { id: clientId, res };
  sseClients.push(client);

  req.on('close', () => {
    const idx = sseClients.findIndex((c) => c.id === clientId);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// Broadcast SSE events
watcher.onEvent((event: any) => {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.res.write(data);
  }
});

// State endpoint
app.get('/state', (_req, res) => {
  res.json(watcher.getState());
});

// MCP tools (HTTP POST) with standardized errors and request IDs
app.post('/tools/call', async (req, res) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  const { name, arguments: args } = req.body;

  if (!name || !toolHandlers[name]) {
    console.log(`[${new Date().toISOString()}] TOOL ${name || '(missing)'} NOT_FOUND ${Date.now() - start}ms`);
    res.status(400).json(createError('TOOL_NOT_FOUND', `Unknown tool: ${name}`, null, requestId));
    return;
  }

  try {
    const result = await toolHandlers[name](args || {});
    console.log(`[${new Date().toISOString()}] TOOL ${name} OK ${Date.now() - start}ms`);
    res.json(createSuccess(result, requestId));
  } catch (err: any) {
    // Check if it's our structured error
    if (err?.error?.code) {
      res.status(400).json({ ...err, error: { ...err.error, requestId } });
    } else {
      console.log(`[${new Date().toISOString()}] TOOL ${name} ERROR ${Date.now() - start}ms: ${err.message}`);
      res.status(500).json(createError('INTERNAL_ERROR', err.message, null, requestId));
    }
  }
});

// Tool definitions endpoint (MCP discovery)
app.get('/tools', (_req, res) => {
  res.json({ tools: toolDefinitions });
});

// Health check (read-only)
app.get('/health', (_req, res) => {
  const orphanScan = scanOrphanedPlans(PIPELINE_DIR);
  res.json({
    status: 'ok',
    port: PORT,
    pid: process.pid,
    orphanScan,
    timestamp: new Date().toISOString(),
  });
});

// Ticket lifecycle detection (v080 — dedicated endpoint, separate from health)
app.post('/tickets/detect', (_req, res) => {
  const stale = detectStaleTickets();
  const expired = detectExpiredTickets();
  res.json({
    detected: true,
    stale,
    expired,
    timestamp: new Date().toISOString(),
  });
});

// Sessions endpoint (v066 — database-backed session history)
app.get('/sessions', (_req, res) => {
  res.json(getAllSessions());
});

// Update session cost (v072 — captured after session ends by executor_cloud.py)
app.post('/sessions/:sessionId/cost', (req, res) => {
  const { sessionId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(400).json({ error: 'Invalid session ID' });
    return;
  }

  const { cost_usd } = req.body;
  if (typeof cost_usd !== 'number' || cost_usd < 0) {
    res.status(400).json({ error: 'Invalid cost_usd — must be a non-negative number' });
    return;
  }

  try {
    updateSessionCost(sessionId, cost_usd);
    res.json({ updated: true, sessionId, cost_usd });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Kill a running session (v072 — kill harness from UI)
app.post('/sessions/:sessionId/kill', (req, res) => {
  const { sessionId } = req.params;

  // Sanitize sessionId
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(400).json({ error: 'Invalid session ID' });
    return;
  }

  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session ${sessionId} not found` });
    return;
  }

  if (!session.is_running) {
    res.status(400).json({ killed: false, error: 'Session is not running', sessionId });
    return;
  }

  const killedPids: number[] = [];
  const errors: string[] = [];

  // Kill the main process by PID
  if (session.pid) {
    try {
      // Kill the entire process group so child processes (opencode, etc.) also die
      process.kill(-session.pid, 'SIGKILL');
      killedPids.push(session.pid);
    } catch (e: any) {
      // Process group may not exist — try just the PID
      try {
        process.kill(session.pid, 'SIGKILL');
        killedPids.push(session.pid);
      } catch (e2: any) {
        errors.push(`PID ${session.pid}: ${e2.message}`);
      }
    }
  }

  // Mark session as ended in DB
  const now = new Date().toISOString();
  endSession(sessionId, 137, now);

  // v077: Release any Tickets claimed by this session so plans can retry
  const released = releaseSessionTickets(sessionId);
  if (released > 0) {
    console.log(`[${now}] Released ${released} ticket(s) from killed session ${sessionId}`);
  }

  console.log(`[${now}] KILL session ${sessionId} role=${session.agent_role} pid=${session.pid} → killed=${killedPids.length}`);

  // Broadcast SSE event so UI updates immediately
  for (const client of sseClients) {
    client.res.write(`data: ${JSON.stringify({
      type: 'session_killed',
      data: { sessionId, killedPids, timestamp: now },
    })}\n\n`);
  }

  res.json({
    killed: true,
    sessionId,
    pids: killedPids,
    timestamp: now,
  });
});

// Kill a running agent by role (v073 — kill builder/reviewer/planner from UI)
app.post('/agents/:role/kill', (req, res) => {
  const { role } = req.params;

  // Validate role
  const validRoles = ['planner', 'builder', 'reviewer', 'critic', 'analyst', 'architect'];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}` });
    return;
  }

  const agents = watcher.getAgents();
  const agent = agents.find(a => a.role === role);

  if (!agent || !agent.pid) {
    res.status(404).json({ killed: false, error: `No running agent found for role: ${role}` });
    return;
  }

  const killedPids: number[] = [];
  const errors: string[] = [];

  // Kill the agent's process group, then fall back to direct PID
  try {
    process.kill(-agent.pid, 'SIGKILL');
    killedPids.push(agent.pid);
  } catch (e: any) {
    try {
      process.kill(agent.pid, 'SIGKILL');
      killedPids.push(agent.pid);
    } catch (e2: any) {
      errors.push(`PID ${agent.pid}: ${e2.message}`);
    }
  }

  // Mark agent as idle
  watcher.updateAgentFinished(role as any);

  const now = new Date().toISOString();

  // v077: Release Tickets claimed by this agent's session so plans can retry
  if (agent && (agent as any).sessionId) {
    const released = releaseSessionTickets((agent as any).sessionId);
    if (released > 0) {
      console.log(`[${now}] Released ${released} ticket(s) from killed ${role} agent session ${(agent as any).sessionId}`);
    }
  }
  console.log(`[${now}] KILL agent role=${role} pid=${agent.pid} → killed=${killedPids.length}`);

  // Broadcast SSE event
  for (const client of sseClients) {
    client.res.write(`data: ${JSON.stringify({
      type: 'agent_killed',
      data: { role, pids: killedPids, timestamp: now },
    })}\n\n`);
  }

  res.json({
    killed: true,
    role,
    pids: killedPids,
    timestamp: now,
  });
});

// Trip circuit breaker (v073 — manual trip from UI)
app.post('/circuit-breaker/trip', (req, res) => {
  const { reason, detail, retryAfter } = req.body || {};

  try {
    tripBreaker({
      error: reason || 'MANUAL_TRIP',
      detail: detail || 'Manually tripped from UI',
      source: 'ui',
      retryAfter: typeof retryAfter === 'number' ? retryAfter : 3600,
    });

    const now = new Date().toISOString();
    console.log(`[${now}] CIRCUIT BREAKER tripped from UI: ${reason || 'MANUAL_TRIP'}`);

    // Broadcast immediately (cb-watcher polls every 5s, but we want instant feedback)
    for (const client of sseClients) {
      client.res.write(`data: ${JSON.stringify({
        type: 'circuit_breaker_update',
        data: {
          tripped: true,
          retryAfter: retryAfter ?? 3600,
          reason: reason || 'MANUAL_TRIP',
        },
        timestamp: now,
      })}\n\n`);
    }

    res.json({
      tripped: true,
      reason: reason || 'MANUAL_TRIP',
      timestamp: now,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Reset circuit breaker (v073 — manual reset from UI)
app.post('/circuit-breaker/reset', (_req, res) => {
  try {
    clearBreaker();

    // v078: Reset abandoned Tickets to open so work can resume
    const ticketsReset = resetAbandonedTickets();

    const now = new Date().toISOString();
    console.log(`[${now}] CIRCUIT BREAKER reset from UI — ${ticketsReset} abandoned ticket(s) reset to open`);

    // Broadcast immediately
    for (const client of sseClients) {
      client.res.write(`data: ${JSON.stringify({
        type: 'circuit_breaker_update',
        data: { tripped: false, ticketsReset },
        timestamp: now,
      })}\n\n`);
    }

    res.json({
      tripped: false,
      ticketsReset,
      timestamp: now,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Pause conduit orchestration (v073 — workflow control, not failure mode)
app.post('/conduit/pause', (_req, res) => {
  try {
    setConduitPaused(true);

    const now = new Date().toISOString();
    console.log(`[${now}] CONDUIT paused from UI`);

    for (const client of sseClients) {
      client.res.write(`data: ${JSON.stringify({
        type: 'conduit_paused',
        data: { paused: true, timestamp: now },
      })}\n\n`);
    }

    res.json({ paused: true, timestamp: now });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Resume conduit orchestration (v073 — workflow control)
app.post('/conduit/resume', (_req, res) => {
  try {
    setConduitPaused(false);

    const now = new Date().toISOString();
    console.log(`[${now}] CONDUIT resumed from UI`);

    for (const client of sseClients) {
      client.res.write(`data: ${JSON.stringify({
        type: 'conduit_paused',
        data: { paused: false, timestamp: now },
      })}\n\n`);
    }

    res.json({ paused: false, timestamp: now });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Restart builder for a specific plan (v074 — user-triggered, bypasses cursor/pause)
app.post('/plans/:planId/restart-builder', (req, res) => {
  const { planId } = req.params;
  const force = req.query.force === 'true';

  // Validate planId
  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    res.status(400).json({ error: 'Invalid plan ID' });
    return;
  }

  // Check that the plan exists
  const plan = getPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: `Plan ${planId} not found` });
    return;
  }

  // Check circuit breaker — if tripped and not forced, return warning
  const breaker = getBreaker();
  if (breaker.tripped === 1 && !force) {
    res.json({
      blocked: true,
      message: 'Circuit breaker is open. Builder restart is blocked until the breaker is reset.',
      breaker: {
        tripped: true,
        error: breaker.error,
        detail: breaker.detail,
        source: breaker.source,
        trippedAt: breaker.tripped_at,
        retryAfter: breaker.retry_after,
      },
    });
    return;
  }

  // Spawn the builder in the background
  const pythonBin = process.env.PYTHON_BIN || 'python3';
  const managerPath = process.env.PIPELINE_MANAGER_PATH ||
    '/home/codex/dev/nexus/python/conduit/main.py';
  const dbPath = process.env.PIPELINE_DB_PATH ||
    '/home/codex/dev/nexus/.conduit-data/pipeline.db';

  const args = [managerPath, '--plan', planId, '--db', dbPath];
  if (force) args.push('--force');

  const now = new Date().toISOString();
  console.log(`[${now}] RESTART builder plan=${planId} force=${force}`);

  const { spawn } = require('child_process');
  try {
    const proc = spawn(pythonBin, args, {
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();

    // Verify the process started
    if (!proc.pid) {
      res.status(500).json({ error: 'Failed to start builder process' });
      return;
    }

    proc.on('error', (err: Error) => {
      console.error(`[${new Date().toISOString()}] RESTART builder spawn error:`, err.message);
    });

    res.json({
      restarted: true,
      planId,
      force,
      breakerTripped: breaker.tripped === 1,
      timestamp: now,
    });
  } catch (e: any) {
    console.error(`[${new Date().toISOString()}] RESTART builder spawn failed:`, e.message);
    res.status(500).json({ error: `Failed to start builder: ${e.message}` });
  }
});

// Pause conduit orchestration (v073 — workflow control, not failure mode)
// Sync plan files from filesystem into the database (v088)
// Scans IMPLEMENTATION_PLANS/ directories and upserts any plan files
// that don't have a corresponding DB row.  Used by the conduit manager
// after the planner creates new plan files, to avoid FK constraint
// failures when issuing receipts.
app.post('/plans/sync', (_req, res) => {
  const IMPL_DIR = path.join(PIPELINE_DIR, 'IMPLEMENTATION_PLANS');
  const dirs = ['pending', 'planning', 'proposed', 'active', 'completed', 'blocked'];
  let synced = 0;
  let totalFiles = 0;
  const now = new Date().toISOString();

  for (const subdir of dirs) {
    const dirPath = path.join(IMPL_DIR, subdir);
    if (!fs.existsSync(dirPath)) continue;

    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.md') || file === '.gitkeep') continue;
      totalFiles++;

      // Extract plan number from filename
      const match = file.match(/v(\d+)/) || file.match(/^(\d{4})-/);
      if (!match) continue;
      const planId = match[1].padStart(4, '0');

      // Check if DB row already exists
      const existing = getPlanById(planId);
      if (existing) continue;

      // Parse the plan file
      const filePath = path.join(dirPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const titleMatch = content.match(/^# (.+)$/m);
        const projectMatch = content.match(/\*\*Project:\*\*\s*(.+)/);
        const goalMatch = content.match(/## Goal\s*\n([\s\S]*?)(?=\n## |$)/);

        upsertPlan({
          id: planId,
          file_name: file,
          title: titleMatch?.[1]?.trim() || file,
          project: projectMatch?.[1]?.trim() || 'conduit-ui',
          goal: goalMatch?.[1]?.trim() || '',
          content: '',
          files_affected: '[]',
          acceptance_criteria: '[]',
          dependencies: '[]',
          prompt_ref: '',
          created_at: now,
          updated_at: now,
        });
        synced++;
        console.log(`[${now}] /plans/sync: created DB row for plan ${planId} (${file})`);
      } catch (e: any) {
        console.error(`[${now}] /plans/sync: failed to parse ${filePath}: ${e.message}`);
      }
    }
  }

  checkpointWal();
  console.log(`[${now}] /plans/sync: synced ${synced} of ${totalFiles} plan files`);
  res.json({ synced, totalFiles, timestamp: now });
});

// Unblock a blocked plan: delete BLOCK receipts and move back to pending (v087)
app.post('/plans/:planId/unblock', (req, res) => {
  const { planId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    res.status(400).json({ error: 'Invalid plan ID' });
    return;
  }

  const plan = getPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: `Plan ${planId} not found` });
    return;
  }

  // Delegate to the MCP tool handler
  const handler = toolHandlers['unblock_plan'];
  if (!handler) {
    res.status(500).json({ error: 'unblock_plan handler not registered' });
    return;
  }

  handler({ planNumber: planId })
    .then((result: any) => res.json(result))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ── v081: Supersede ticket (replace with a new objective) ──────────
app.post('/tickets/:ticketId/supersede', (req, res) => {
  const { ticketId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return;
  }
  const { reason, replace } = req.body || {};
  try {
    // v081: supersede + optional replacement in one atomic call
    const result = supersedeTicket(ticketId, reason || 'Manually superseded', !!replace);
    if (!result.superseded) {
      res.status(404).json({ superseded: false, error: 'Ticket not found or not in a supersedeable state' });
      return;
    }

    const now = new Date().toISOString();
    if (result.replacementId) {
      console.log(`[${now}] SUPERSEDE ticket ${ticketId} → replacement ${result.replacementId}`);
    }

    // Broadcast SSE event so UI updates immediately
    for (const client of sseClients) {
      client.res.write(`data: ${JSON.stringify({
        type: 'ticket_superseded',
        data: { ticketId, replacementId: result.replacementId, reason: reason || 'Manually superseded', timestamp: now },
      })}\n\n`);
    }

    res.json({
      superseded: true,
      ticketId,
      replacementId: result.replacementId || null,
      replaced: !!replace,
      timestamp: now,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── v081: Cancel ticket (explicit denial of authorization) ─────────
app.post('/tickets/:ticketId/cancel', (req, res) => {
  const { ticketId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return;
  }
  const { reason } = req.body || {};
  try {
    const count = cancelTicket(ticketId, reason || 'Manually cancelled');
    if (count > 0) {
      const now = new Date().toISOString();
      // Broadcast SSE event so UI updates immediately
      for (const client of sseClients) {
        client.res.write(`data: ${JSON.stringify({
          type: 'ticket_cancelled',
          data: { ticketId, reason: reason || 'Manually cancelled', timestamp: now },
        })}\n\n`);
      }
      res.json({ cancelled: true, ticketId, timestamp: now });
    } else {
      res.status(404).json({ cancelled: false, error: 'Ticket not found or not in a cancellable state' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── v080: Token usage reporting ────────────────────────────────────
app.get('/tokens/plan/:planId', (req, res) => {
  const { planId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    res.status(400).json({ error: 'Invalid plan ID' });
    return;
  }
  res.json(getTokenUsageByPlan(planId));
});
app.get('/tokens/role/:role', (req, res) => {
  const { role } = req.params;
  if (!['builder', 'reviewer', 'planner', 'critic'].includes(role)) {
    res.status(400).json({ error: `Invalid role: ${role}` });
    return;
  }
  res.json(getTokenUsageByRole(role));
});
app.get('/tokens/ticket/:ticketId', (req, res) => {
  const { ticketId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return;
  }
  res.json(getTokenUsageByTicket(ticketId));
});

// ── v081: Ticket lineage (audit trail) ─────────────────────────────
app.get('/tickets/lineage/:planId', (req, res) => {
  const { planId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    res.status(400).json({ error: 'Invalid plan ID' });
    return;
  }
  res.json({
    plan_id: planId,
    tickets: getTicketLineage(planId),
  });
});

// ── v083: AI Configuration Registry ───────────────────────────────

// Full snapshot: all providers, harnesses, models, and role configs
app.get('/config/ai', (_req, res) => {
  res.json(getAIConfigSnapshot());
});

// Seed defaults: populates empty AI config tables with reasonable starter values
app.post('/config/ai/seed-defaults', (req, res) => {
  try {
    const { force } = req.body || {};
    const result = seedDefaultAIConfig(!!force);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Providers ─────────────────────────────────────────────────────
app.post('/config/ai/provider', (req, res) => {
  try {
    const { id, name, type, endpoint_url, api_key, config_json } = req.body || {};
    if (!id || !name || !type) {
      res.status(400).json({ error: 'id, name, and type are required' });
      return;
    }
    upsertAIProvider({ id, name, type, endpoint_url: endpoint_url ?? null, api_key: api_key ?? null, config_json: config_json ?? '{}' });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/config/ai/provider/:id', (req, res) => {
  const { id } = req.params;
  try {
    const deleted = deleteAIProvider(id);
    res.json({ deleted, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Harnesses ─────────────────────────────────────────────────────
app.post('/config/ai/harness', (req, res) => {
  try {
    const { id, name, invocation_semantics } = req.body || {};
    if (!id || !name) {
      res.status(400).json({ error: 'id and name are required' });
      return;
    }
    upsertAIHarness({ id, name, invocation_semantics: invocation_semantics ?? '{}' });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/config/ai/harness/:id', (req, res) => {
  const { id } = req.params;
  try {
    const deleted = deleteAIHarness(id);
    res.json({ deleted, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Models ────────────────────────────────────────────────────────
app.post('/config/ai/model', (req, res) => {
  try {
    const { id, name, harness_id, provider_id, model_identifier } = req.body || {};
    if (!id || !name || !harness_id || !model_identifier) {
      res.status(400).json({ error: 'id, name, harness_id, and model_identifier are required' });
      return;
    }
    upsertAIModel({ id, name, harness_id, provider_id: provider_id ?? null, model_identifier });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/config/ai/model/:id', (req, res) => {
  const { id } = req.params;
  try {
    const deleted = deleteAIModel(id);
    res.json({ deleted, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Role Assignment ───────────────────────────────────────────────
app.post('/config/ai/role', (req, res) => {
  try {
    const { id, role, provider_id, harness_id, model_id, extra_params } = req.body || {};
    if (!id || !role || !provider_id || !harness_id || !model_id) {
      res.status(400).json({ error: 'id, role, provider_id, harness_id, and model_id are required' });
      return;
    }
    upsertAIRoleConfig({ id, role, provider_id, harness_id, model_id, extra_params: extra_params ?? '{}' });
    res.json({ saved: true, id, role });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── v081: Agent chat (message box) ──────────────────────────────────

const AGENT_CHAT_URL = process.env.AGENT_CHAT_URL || 'http://localhost:3101';

// Proxy: send message to agent via the chat server
app.post('/chat/send', async (req, res) => {
  const { role, message, log_level } = req.body || {};
  if (!role || !message) {
    res.status(400).json({ error: 'role and message are required' });
    return;
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const agentToken = process.env.AGENT_CHAT_TOKEN;
    if (agentToken) {
      headers['Authorization'] = `Bearer ${agentToken}`;
    }

    const body = JSON.stringify({ role, message, ...(log_level ? { log_level } : {}) });
    headers['Content-Length'] = Buffer.byteLength(body).toString();

    const proxyReq = http.request(
      `${AGENT_CHAT_URL}/chat`,
      { method: 'POST', headers, timeout: 30000 },
      (proxyRes: any) => {
        let body = '';
        proxyRes.on('data', (chunk: string) => (body += chunk));
        proxyRes.on('end', () => {
          if (proxyRes.statusCode && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            try {
              res.status(proxyRes.statusCode).json(JSON.parse(body));
            } catch {
              res.status(502).json({ error: 'Invalid response from agent chat server' });
            }
          } else {
            let detail = body;
            try {
              const parsed = JSON.parse(body);
              detail = parsed.error || parsed.detail || body;
            } catch { /* use raw body */ }
            res.status(proxyRes.statusCode || 502).json({
              error: 'Agent chat server error',
              detail,
            });
          }
        });
      },
    );
    proxyReq.on('error', (err: Error) => {
      if ((err as any).code === 'ECONNREFUSED') {
        res.status(502).json({ error: 'Agent chat server unreachable', detail: 'Connection refused — is the agent chat service running?' });
      } else if ((err as any).code === 'ETIMEDOUT' || err.message === 'socket hang up') {
        res.status(502).json({ error: 'Agent chat server timed out' });
      } else {
        res.status(502).json({ error: 'Agent chat server unreachable', detail: err.message });
      }
    });
    proxyReq.end(body);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Config: tell the UI where the agent chat SSE server lives
app.get('/chat/config', (_req, res) => {
  res.json({
    agentChatUrl: AGENT_CHAT_URL,
    agents: [
      { role: 'planner', label: 'Planner', description: 'Creates and refines implementation plans' },
      { role: 'builder', label: 'Builder', description: 'Implements plans, modifies code' },
      { role: 'reviewer', label: 'Reviewer', description: 'Reviews implementations against plans' },
      { role: 'critic', label: 'Critic', description: 'Critiques plans for gaps and improvements' },
    ],
  });
});

// Proxy: list active agent chat sessions
app.get('/chat/sessions', (_req, res) => {
  try {
    const http = require('http') as typeof import('http');
    http.get(`${AGENT_CHAT_URL}/chat/sessions`, (proxyRes: any) => {
      let body = '';
      proxyRes.on('data', (chunk: string) => (body += chunk));
      proxyRes.on('end', () => {
        try { res.json(JSON.parse(body)); } catch { res.json({ sessions: [] }); }
      });
    }).on('error', () => res.json({ sessions: [] }));
  } catch {
    res.json({ sessions: [] });
  }
});

// Session log SSE endpoint (v071 — streaming live builder output)
app.get('/log/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  // Sanitize sessionId — prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(400).json({ error: 'Invalid session ID' });
    return;
  }

  const sessionsDir = path.join(PIPELINE_DIR, 'sessions');
  const logPath = path.join(sessionsDir, `${sessionId}.log`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  let lastSize = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let resolved = false;

  const sendLines = () => {
    try {
      if (!fs.existsSync(logPath)) return;
      const stats = fs.statSync(logPath);
      if (stats.size <= lastSize) return;

      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(stats.size - lastSize);
      fs.readSync(fd, buf, 0, buf.length, lastSize);
      fs.closeSync(fd);
      lastSize = stats.size;

      const newContent = buf.toString('utf-8');
      const lines = newContent.split('\n');
      for (const line of lines) {
        if (line.length === 0) continue;
        const event = JSON.stringify({
          type: 'session_log',
          data: {
            sessionId,
            line,
            timestamp: new Date().toISOString(),
          },
        });
        res.write(`data: ${event}\n\n`);
      }
    } catch {
      // file may disappear — stop polling
    }
  };

  // Send meta event so the UI knows whether a log file exists
  const logExists = fs.existsSync(logPath);
  res.write(`data: ${JSON.stringify({
    type: 'session_log_meta',
    data: { sessionId, logFileExists: logExists, logPath },
  })}\n\n`);

  // Send any existing content immediately (only if file exists)
  if (logExists) {
    sendLines();
  }

  // Poll for new content every 500ms (only if file exists)
  if (logExists) {
    pollTimer = setInterval(() => {
      if (resolved) return;
      sendLines();
    }, 500);
  }

  // Keep-alive ping every 15 seconds
  const keepAlive = setInterval(() => {
    if (resolved) return;
    res.write(`: keepalive\n\n`);
  }, 15000);

  req.on('close', () => {
    resolved = true;
    if (pollTimer) clearInterval(pollTimer);
    clearInterval(keepAlive);
  });
});

// ── PID file for reliable restarts ───────────────────────────────
// Prevents EADDRINUSE by killing the previous instance before binding.
// Also cleans up on graceful shutdown so a stale PID file doesn't
// cause false positives.

const PID_FILE = path.join(PIPELINE_DIR, 'mcp-server.pid');

/** Read, verify, and kill the previous MCP server instance if still alive.
 *  Sends SIGTERM first (graceful shutdown), then SIGKILL if still alive. */
function claimPidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const oldPidStr = fs.readFileSync(PID_FILE, 'utf-8').trim();
      const oldPid = parseInt(oldPidStr, 10);
      if (!isNaN(oldPid) && oldPid > 0 && oldPid !== process.pid) {
        // Check if the process is still running (signal 0 = test only, no kill)
        try {
          process.kill(oldPid, 0);
          console.log(`[PID] Previous server PID ${oldPid} still running — killing it.`);
          // SIGTERM: graceful shutdown (process group → single PID fallback)
          try { process.kill(-oldPid, 'SIGTERM'); }
          catch { process.kill(oldPid, 'SIGTERM'); }
          // Brief pause so SIGTERM can take effect, then SIGKILL if still alive
          for (let i = 0; i < 15; i++) {
            try {
              process.kill(oldPid, 0);  // still alive?
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);  // ~200ms delay
            } catch {
              break;  // process died
            }
          }
          // Force-kill if still alive
          try {
            process.kill(oldPid, 0);
            try { process.kill(-oldPid, 'SIGKILL'); }
            catch { process.kill(oldPid, 'SIGKILL'); }
            console.log(`[PID] Force-killed previous server PID ${oldPid}.`);
          } catch {
            console.log(`[PID] Previous server PID ${oldPid} shut down gracefully.`);
          }
        } catch {
          console.log(`[PID] Previous PID ${oldPid} is not running — stale PID file.`);
        }
      }
    }
  } catch (e: any) {
    console.warn(`[PID] Error claiming PID file: ${e.message}`);
  }

  // Write current PID
  try {
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
    console.log(`[PID] PID ${process.pid} written to ${PID_FILE}`);
  } catch (e: any) {
    console.warn(`[PID] Could not write PID file: ${e.message}`);
  }
}

/** Remove the PID file on graceful shutdown. */
function releasePidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const current = fs.readFileSync(PID_FILE, 'utf-8').trim();
      if (current === String(process.pid)) {
        fs.unlinkSync(PID_FILE);
        console.log(`[PID] PID file removed.`);
      }
    }
  } catch {
    // best-effort cleanup
  }
}

// Register shutdown handlers
process.on('exit', releasePidFile);
process.on('SIGINT', () => {
  releasePidFile();
  process.exit(0);
});
process.on('SIGTERM', () => {
  releasePidFile();
  process.exit(0);
});

// Initialize and start
async function start() {
  claimPidFile();
  await watcher.initialize();

  app.listen(PORT, () => {
    console.log(`Watching ${PIPELINE_DIR}...`);
    console.log(`MCP server listening on http://localhost:${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/events`);
    console.log(`State endpoint: http://localhost:${PORT}/state`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  releasePidFile();
  process.exit(1);
});

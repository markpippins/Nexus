import express from "express";
import cors from "cors";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { PipelineWatcher } from "./watcher";
import { registerToolHandlers, toolDefinitions } from "./tools";
import { createError, createSuccess } from "./errors";
import {
  getAllSessions,
  getSession,
  endSession,
  updateSessionCost,
  updateSessionHeartbeat,
  tripBreaker,
  clearBreaker,
  setConduitPaused,
  getBreaker,
  getDb,
  getPlanById,
  releaseSessionTickets,
  resetAbandonedTickets,
  detectStaleTickets,
  detectExpiredTickets,
  supersedeTicket,
  cancelTicket,
  getTokenUsageByPlan,
  getTokenUsageByRole,
  getTokenUsageByTicket,
  getTicketLineage,
  requestSchedulerWake,
  startSession,
  updateSessionPid,
  replayGovernanceEvents,
  listGovernanceEvents,
  createWorkRequest,
  getWorkRequest,
  listWorkRequests,
  listReceiptsByPlan,
  appendEvent,
  getEvents,
  getAllEvents,
  selectNextRunnable,
  listWorkRequestStates,
  checkProjectionDrift,
  resolveWrUuid,
} from "./db";
import * as api from "./conduit-client";
import {
  validateCompilerOutput,
  compilerOutputToEvent,
  foldEvents,
  decide,
  validateTransition,
  createDraftState,
  getDecisionPriority,
  dbEventsToRuntimeEvents,
  CompilerOutput,
  WorkRequestState,
  RuntimeEvent,
} from "./runtime-kernel";
import http from "node:http";
import { loadEnv } from "./env"; // shared .env loader (no dotenv dependency)
import { validateReceipt } from "./receipts";

// .env already loaded by env.ts at module evaluation time

const PORT = parseInt(process.env.PORT || "3100", 10);
const PIPELINE_DIR =
  process.env.PIPELINE_DIR ||
  path.resolve(__dirname, "../../../../nexus/.conduit-data");
const GRAPH_DIR =
  process.env.GRAPH_DIR ||
  path.resolve(PIPELINE_DIR, "../graph");

const app = express();
app.use(cors());
app.use(express.json());

// ── MCP JSON-RPC endpoint (POST /) ─────────────────────────────
// Standard MCP protocol via Streamable HTTP transport (rmcp client).
app.post("/", express.json(), async (req, res) => {
  const msg = req.body;
  if (!msg || msg.jsonrpc !== "2.0" || !msg.method) {
    res
      .status(400)
      .json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request" },
        id: null,
      });
    return;
  }

  const { method, params, id } = msg;

  // Notifications have no id — no response expected
  if (
    method === "notifications/initialized" ||
    method === "notifications/cancelled"
  ) {
    res.status(202).end();
    return;
  }

  const respond = (result: any) => res.json({ jsonrpc: "2.0", result, id });
  const respondError = (code: number, message: string) =>
    res.json({ jsonrpc: "2.0", error: { code, message }, id });

  try {
    switch (method) {
      case "initialize":
        respond({
          protocolVersion: "2025-03-26",
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: "conduit-mcp",
            version: "1.0.0",
          },
        });
        break;

      case "tools/list": {
        respond({ tools: toolDefinitions });
        break;
      }

      case "tools/call": {
        const { name, arguments: args } = params || {};
        if (!name || !toolHandlers[name]) {
          respondError(-32601, `Unknown tool: ${name}`);
          return;
        }
        const result = await toolHandlers[name](args || {});
        respond({ content: [{ type: "text", text: JSON.stringify(result) }] });
        break;
      }

      case "resources/list":
        respond({ resources: [] });
        break;

      default:
        respondError(-32601, `Method not found: ${method}`);
    }
  } catch (err: any) {
    console.error(`[MCP] Error in ${method}:`, err.message);
    respondError(-32603, err.message || "Internal error");
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
    );
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
const watcher = new PipelineWatcher(PIPELINE_DIR, GRAPH_DIR);
// Create emitter for tools to emit SSE events (e.g., on receipt issuance)
const toolEmitter = (event: any) => watcher.emitToolEvent(event);
const toolHandlers = registerToolHandlers(watcher, toolEmitter);

// SSE endpoint
app.get("/events", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  res.write(
    `data: ${JSON.stringify({ type: "connected", message: "SSE connected" })}\n\n`,
  );

  // Push full state immediately so reconnecting clients get fresh data
  try {
    const initialState = await watcher.getState();
    res.write(
      `data: ${JSON.stringify({ type: "state_full", data: initialState })}\n\n`,
    );
  } catch {
    // state not ready yet, client will get it on next heartbeat
  }

  const clientId = ++clientIdCounter;
  const client: SSEClient = { id: clientId, res };
  sseClients.push(client);

  req.on("close", () => {
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
app.get("/state", async (_req, res) => {
  const state = await watcher.getState();
  res.json(state);
});

// MCP tools (HTTP POST) with standardized errors and request IDs
app.post("/tools/call", async (req, res) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  const { name, arguments: args } = req.body;

  if (!name || !toolHandlers[name]) {
    console.log(
      `[${new Date().toISOString()}] TOOL ${name || "(missing)"} NOT_FOUND ${Date.now() - start}ms`,
    );
    res
      .status(400)
      .json(
        createError("TOOL_NOT_FOUND", `Unknown tool: ${name}`, null, requestId),
      );
    return;
  }

  try {
    const result = await toolHandlers[name](args || {});
    console.log(
      `[${new Date().toISOString()}] TOOL ${name} OK ${Date.now() - start}ms`,
    );
    res.json(createSuccess(result, requestId));
  } catch (err: any) {
    // Check if it's our structured error
    if (err?.error?.code) {
      res.status(400).json({ ...err, error: { ...err.error, requestId } });
    } else {
      console.log(
        `[${new Date().toISOString()}] TOOL ${name} ERROR ${Date.now() - start}ms: ${err.message}`,
      );
      res
        .status(500)
        .json(createError("INTERNAL_ERROR", err.message, null, requestId));
    }
  }
});

// Tool definitions endpoint (MCP discovery)
app.get("/tools", async (_req, res) => {
  res.json({ tools: toolDefinitions });
});

// Health check (read-only)
app.get("/health", async (_req, res) => {
  res.json({
    status: "ok",
    port: PORT,
    pid: process.pid,
    timestamp: new Date().toISOString(),
  });
});

// Workflow status endpoint — backed by sessions (Temporal removed).
// Returns active sessions formatted the same way the UI expects.
app.get("/workflows", async (req, res) => {
  try {
    const sessions = await getAllSessions();
    const active = sessions.filter((s: any) => s.is_running === 1 || s.is_running === true);
    const workflows = active.map((s: any) => {
      let planId = "";
      try {
        const plans = JSON.parse(s.plans_processed || "[]");
        if (Array.isArray(plans) && plans.length > 0) planId = plans[0];
      } catch {}
      return {
        workflowId: planId ? `plan-${planId}-${s.agent_role}` : s.id,
        runId: s.id,
        status: "running",
        startTime: s.start_iso || s.created_at || null,
        closeTime: s.end_iso || null,
        planId,
        role: s.agent_role,
        pid: s.pid ?? null,
      };
    });
    const counts = { running: workflows.length, completed: 0, failed: 0, cancelled: 0, total: workflows.length };
    res.json({ connected: true, counts, workflows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Ticket lifecycle detection (v080 — dedicated endpoint, separate from health)
app.post("/tickets/detect", async (_req, res) => {
  const stale = await detectStaleTickets();
  const expired = await detectExpiredTickets();
  res.json({
    detected: true,
    stale,
    expired,
    timestamp: new Date().toISOString(),
  });
});

// Sessions endpoint (v066 — database-backed session history)
// Sessions now own their workflow metadata natively (workflow_id, run_id, etc.)
app.get("/sessions", async (_req, res) => {
  try {
    const sessions = await api.getAllSessions();
    res.json(sessions);
  } catch (e: any) {
    console.error("[sessions] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Update session cost (v072 — captured after session ends by executor_cloud.py)
app.post("/sessions/:sessionId/cost", async (req, res) => {
  const { sessionId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const { cost_usd } = req.body;
  if (typeof cost_usd !== "number" || cost_usd < 0) {
    res
      .status(400)
      .json({ error: "Invalid cost_usd — must be a non-negative number" });
    return;
  }

  try {
    await api.updateSessionCost(sessionId, cost_usd);
    res.json({ updated: true, sessionId, cost_usd });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Agent heartbeat — called periodically by executor_cloud.py during harness execution
// Updates last_activity and last_heartbeat_at on the sessions row for staleness detection.
// Also updates the in-memory agent-watcher state for /state visibility.
app.post("/sessions/:sessionId/heartbeat", async (req, res) => {
  const { sessionId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  try {
    await api.updateSessionHeartbeat(sessionId);
    // Update in-memory agent state if role is provided in body
    const role = req.body?.role;
    if (role && watcher) {
      watcher.updateAgentHeartbeat(
        role as any,
        req.body?.state || "working",
        req.body?.detail || null,
        req.body?.pid || null,
      );
    }
    res.json({ updated: true, sessionId, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Kill a running session (v072 — kill harness from UI)
app.post("/sessions/:sessionId/kill", async (req, res) => {
  const { sessionId } = req.params;

  // Sanitize sessionId
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }    const session = await api.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session ${sessionId} not found` });
    return;
  }

  if (!session.is_running) {
    res
      .status(400)
      .json({ killed: false, error: "Session is not running", sessionId });
    return;
  }    // Delegate to Python conduit which handles kill signal + DB cleanup atomically
  const result = await api.killSession(sessionId);

  // Broadcast SSE event so UI updates immediately
  for (const client of sseClients) {
    client.res.write(
      `data: ${JSON.stringify({
        type: "session_killed",
        data: {
          sessionId,
          killedPids: result.pids,
          timestamp: result.timestamp,
        },
      })}\n\n`,
    );
  }

  res.json(result);
});

// Kill a running agent by role (v073 — kill builder/reviewer/planner from UI)
app.post("/agents/:role/kill", async (req, res) => {
  const { role } = req.params;

  // Validate role
  const validRoles = [
    "planner",
    "builder",
    "reviewer",
    "critic",
    "analyst",
    "architect",
  ];
  if (!validRoles.includes(role)) {
    res
      .status(400)
      .json({
        error: `Invalid role: ${role}. Must be one of: ${validRoles.join(", ")}`,
      });
    return;
  }

  const agents = watcher.getAgents();
  const agent = agents.find((a) => a.role === role);

  if (!agent || !agent.pid) {
    res
      .status(404)
      .json({
        killed: false,
        error: `No running agent found for role: ${role}`,
      });
    return;
  }

  const killedPids: number[] = [];
  const errors: string[] = [];

  // Kill the agent's process group, then fall back to direct PID
  try {
    process.kill(-agent.pid, "SIGKILL");
    killedPids.push(agent.pid);
  } catch (e: any) {
    try {
      process.kill(agent.pid, "SIGKILL");
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
    const released = await releaseSessionTickets((agent as any).sessionId);
    if (released > 0) {
      console.log(
        `[${now}] Released ${released} ticket(s) from killed ${role} agent session ${(agent as any).sessionId}`,
      );
    }
  }
  console.log(
    `[${now}] KILL agent role=${role} pid=${agent.pid} → killed=${killedPids.length}`,
  );

  // Broadcast SSE event
  for (const client of sseClients) {
    client.res.write(
      `data: ${JSON.stringify({
        type: "agent_killed",
        data: { role, pids: killedPids, timestamp: now },
      })}\n\n`,
    );
  }

  res.json({
    killed: true,
    role,
    pids: killedPids,
    timestamp: now,
  });
});

// Trip circuit breaker (v073 — manual trip from UI)
app.post("/circuit-breaker/trip", async (req, res) => {
  const { reason, detail, retryAfter } = req.body || {};

  try {
    await api.tripBreaker({
      error: reason || "MANUAL_TRIP",
      detail: detail || "Manually tripped from UI",
      source: "ui",
      retryAfter: typeof retryAfter === "number" ? retryAfter : 3600,
    });

    const now = new Date().toISOString();
    console.log(
      `[${now}] CIRCUIT BREAKER tripped from UI: ${reason || "MANUAL_TRIP"}`,
    );

    // Broadcast immediately (cb-watcher polls every 5s, but we want instant feedback)
    for (const client of sseClients) {
      client.res.write(
        `data: ${JSON.stringify({
          type: "circuit_breaker_update",
          data: {
            tripped: true,
            retryAfter: retryAfter ?? 3600,
            reason: reason || "MANUAL_TRIP",
          },
          timestamp: now,
        })}\n\n`,
      );
    }

    res.json({
      tripped: true,
      reason: reason || "MANUAL_TRIP",
      timestamp: now,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Reset circuit breaker (v073 — manual reset from UI)
app.post("/circuit-breaker/reset", async (_req, res) => {
  try {
    await api.clearBreaker();

    // Wake the Python scheduler so it re-polls immediately instead of
    // waiting out the idle backoff (SCHEDULER_IDLE_BACKOFF, 60s).
    await requestSchedulerWake();

    // v078: Reset abandoned Tickets to open so work can resume
    const ticketsReset = await resetAbandonedTickets();

    const now = new Date().toISOString();
    console.log(
      `[${now}] CIRCUIT BREAKER reset from UI — ${ticketsReset} abandoned ticket(s) reset to open`,
    );

    // Broadcast immediately
    for (const client of sseClients) {
      client.res.write(
        `data: ${JSON.stringify({
          type: "circuit_breaker_update",
          data: { tripped: false, ticketsReset },
          timestamp: now,
        })}\n\n`,
      );
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
app.post("/conduit/pause", async (_req, res) => {
  try {
    await api.setConduitPaused(true);

    const now = new Date().toISOString();
    console.log(`[${now}] CONDUIT paused from UI`);

    for (const client of sseClients) {
      client.res.write(
        `data: ${JSON.stringify({
          type: "conduit_paused",
          data: { paused: true, timestamp: now },
        })}\n\n`,
      );
    }

    res.json({ paused: true, timestamp: now });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Resume conduit orchestration (v073 — workflow control)
app.post("/conduit/resume", async (_req, res) => {
  try {
    await api.setConduitPaused(false);

    const now = new Date().toISOString();
    console.log(`[${now}] CONDUIT resumed from UI`);

    for (const client of sseClients) {
      client.res.write(
        `data: ${JSON.stringify({
          type: "conduit_paused",
          data: { paused: false, timestamp: now },
        })}\n\n`,
      );
    }

    res.json({ paused: false, timestamp: now });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Restart builder for a specific plan (v074 — user-triggered, bypasses cursor/pause)
app.post("/plans/:planId/restart-builder", async (req, res) => {
  const { planId } = req.params;
  const force = req.query.force === "true";

  // Validate planId
  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }

  // Check that the plan exists
  const plan = await getPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: `Plan ${planId} not found` });
    return;
  }

  // Check circuit breaker — if tripped and not forced, return warning
  const breaker = await getBreaker();
  if (breaker.tripped === 1 && !force) {
    res.json({
      blocked: true,
      message:
        "Circuit breaker is open. Builder restart is blocked until the breaker is reset.",
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

  // Spawn main.py --plan <id> --force (cron-driven dispatch)
  const now = new Date().toISOString();
  console.log(`[${now}] RESTART builder plan=${planId} force=${force} (main.py)`);

  try {
    const pyBin = process.env.CONDUIT_PYTHON || "python3";
    const conduitDir = process.env.CONDUIT_PY_DIR ||
      path.resolve(__dirname, "../../../../nexus/python/conduit");
    // `tackle` package lives in nexus/python (parent of conduit dir). The
    // scheduled builder relies on PYTHONPATH set by cron; mirror that here so
    // `from tackle.db import get_role_config` resolves when restarted via the
    // REST endpoint instead of the scheduler.
    const pythonPath = process.env.PYTHONPATH ||
      path.resolve(conduitDir, "..");
    const proc = spawn(pyBin, ["main.py", "--plan", planId, ...(force ? ["--force"] : [])], {
      cwd: conduitDir,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PYTHONPATH: pythonPath },
    });
    proc.unref();

    console.log(
      `[${now}] RESTART builder plan=${planId} → main.py PID ${proc.pid} spawned`,
    );

    res.json({
      restarted: true,
      planId,
      force,
      pid: proc.pid,
      breakerTripped: breaker.tripped === 1,
      timestamp: now,
    });
  } catch (e: any) {
    console.error(
      `[${now}] RESTART builder plan=${planId} → spawn failed:`,
      e.message,
    );
    res.status(500).json({ error: `Failed to spawn builder: ${e.message}` });
  }
});

// Unblock a blocked plan: delete BLOCK receipts and move back to pending (v087)
app.post("/plans/:planId/unblock", async (req, res) => {
  const { planId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }

  const plan = await getPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: `Plan ${planId} not found` });
    return;
  }

  // Delegate to the MCP tool handler
  const handler = toolHandlers["unblock_plan"];
  if (!handler) {
    res.status(500).json({ error: "unblock_plan handler not registered" });
    return;
  }

  handler({ planNumber: planId })
    .then((result: any) => res.json(result))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ── v081: Supersede ticket (replace with a new objective) ──────────
app.post("/tickets/:ticketId/supersede", async (req, res) => {
  const { ticketId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  const { reason, replace } = req.body || {};
  try {
    // v081: supersede + optional replacement in one atomic call
    const result = await supersedeTicket(
      ticketId,
      reason || "Manually superseded",
      !!replace,
    );
    if (!result.superseded) {
      res
        .status(404)
        .json({
          superseded: false,
          error: "Ticket not found or not in a supersedeable state",
        });
      return;
    }

    const now = new Date().toISOString();
    if (result.replacementId) {
      console.log(
        `[${now}] SUPERSEDE ticket ${ticketId} → replacement ${result.replacementId}`,
      );
    }

    // Broadcast SSE event so UI updates immediately
    for (const client of sseClients) {
      client.res.write(
        `data: ${JSON.stringify({
          type: "ticket_superseded",
          data: {
            ticketId,
            replacementId: result.replacementId,
            reason: reason || "Manually superseded",
            timestamp: now,
          },
        })}\n\n`,
      );
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
app.post("/tickets/:ticketId/cancel", async (req, res) => {
  const { ticketId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  const { reason } = req.body || {};
  try {
    const count = await cancelTicket(ticketId, reason || "Manually cancelled");
    if (count > 0) {
      const now = new Date().toISOString();
      // Broadcast SSE event so UI updates immediately
      for (const client of sseClients) {
        client.res.write(
          `data: ${JSON.stringify({
            type: "ticket_cancelled",
            data: {
              ticketId,
              reason: reason || "Manually cancelled",
              timestamp: now,
            },
          })}\n\n`,
        );
      }
      res.json({ cancelled: true, ticketId, timestamp: now });
    } else {
      res
        .status(404)
        .json({
          cancelled: false,
          error: "Ticket not found or not in a cancellable state",
        });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── v080: Token usage reporting ────────────────────────────────────
app.get("/tokens/plan/:planId", async (req, res) => {
  const { planId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }
  res.json(await getTokenUsageByPlan(planId));
});
app.get("/tokens/role/:role", async (req, res) => {
  const { role } = req.params;
  if (!["builder", "reviewer", "planner", "critic"].includes(role)) {
    res.status(400).json({ error: `Invalid role: ${role}` });
    return;
  }
  res.json(await getTokenUsageByRole(role));
});
app.get("/tokens/ticket/:ticketId", async (req, res) => {
  const { ticketId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  res.json(await getTokenUsageByTicket(ticketId));
});

// ── v081: Ticket lineage (audit trail) ─────────────────────────────
app.get("/tickets/lineage/:planId", async (req, res) => {
  const { planId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }
  res.json({
    plan_id: planId,
    tickets: await getTicketLineage(planId),
  });
});

// ── Cron schedule configuration ────────────────────────────────────
// Exposes the pipeline-manager's cron interval so the UI can
// display an accurate countdown to the next scheduled execution.
// The interval is read from the PIPELINE_CRON env var (default */3).

const PIPELINE_CRON = process.env.PIPELINE_CRON || "*/3";

app.get("/config/cron", async (_req, res) => {
  // Parse the interval from cron expression (only */N supported for now)
  const match = PIPELINE_CRON.match(/^\*\/(\d+)$/);
  const intervalMinutes = match ? parseInt(match[1], 10) : 3;

  res.json({
    cron: PIPELINE_CRON,
    intervalMinutes,
    description: `Every ${intervalMinutes} minute${intervalMinutes === 1 ? '' : 's'}`,
    timestamp: new Date().toISOString(),
  });
});

// ── v105: Failure Recovery Configuration ──────────────────────────

// Get failure recovery config (from circuit_breaker row)
app.get("/config/failure-recovery", async (_req, res) => {
  try {
    const breaker = await api.getBreaker();
    res.json({
      max_retries_per_model: breaker.max_retries_per_model ?? 3,
      retry_delay_seconds: breaker.retry_delay_seconds ?? 120,
      max_fallbacks: breaker.max_fallbacks ?? 3,
      push_back_to_pending: breaker.push_back_to_pending === 1 || breaker.push_back_to_pending === null,
      circuit_breaker_retry_after: breaker.retry_after ?? 1800,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Save failure recovery config
app.post("/config/failure-recovery", async (req, res) => {
  try {
    const {
      max_retries_per_model,
      retry_delay_seconds,
      max_fallbacks,
      push_back_to_pending,
      circuit_breaker_retry_after,
    } = req.body || {};

    const now = new Date().toISOString();
    await api.saveFailureRecoveryConfig({
      max_retries_per_model,
      retry_delay_seconds,
      max_fallbacks,
      push_back_to_pending,
      circuit_breaker_retry_after,
    });

    console.log(`[${now}] FAILURE RECOVERY config updated`);
    res.json({ saved: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Configuration Registry removed — owned by tackle-mcp (:3400) ──

// (All /config/ai/* endpoints deleted. Use tackle-mcp for AI config.)

// ── Agent chat removed — now handled by operator_svc (port 3018) ──
// Chat endpoints (POST /chat/send, GET /chat/config, GET /chat/sessions)
// were removed from conduit-mcp. The UI connects directly to operator_svc.

// Session log SSE endpoint (v071 — streaming live builder output)
app.get("/log/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  // Sanitize sessionId — prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const sessionsDir = path.join(PIPELINE_DIR, "sessions");
  const logPath = path.join(sessionsDir, `${sessionId}.log`);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  let lastSize = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let resolved = false;

  const sendLines = () => {
    try {
      if (!fs.existsSync(logPath)) return;
      const stats = fs.statSync(logPath);
      if (stats.size <= lastSize) return;

      const fd = fs.openSync(logPath, "r");
      const buf = Buffer.alloc(stats.size - lastSize);
      fs.readSync(fd, buf, 0, buf.length, lastSize);
      fs.closeSync(fd);
      lastSize = stats.size;

      const newContent = buf.toString("utf-8");
      const lines = newContent.split("\n");
      for (const line of lines) {
        if (line.length === 0) continue;
        // Detect stderr lines from executor_cloud.py's [stderr] prefix
        const isStderr = line.startsWith("[stderr] ") || line.startsWith("[stderr]");
        const logType = isStderr ? "stderr" : "stdout";
        const event = JSON.stringify({
          type: "session_log",
          data: {
            sessionId,
            line,
            timestamp: new Date().toISOString(),
            logType,
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
  res.write(
    `data: ${JSON.stringify({
      type: "session_log_meta",
      data: { sessionId, logFileExists: logExists, logPath },
    })}\n\n`,
  );

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

  req.on("close", () => {
    resolved = true;
    if (pollTimer) clearInterval(pollTimer);
    clearInterval(keepAlive);
  });
});

// ── Governance Events ───────────────────────────────────────────────
// Observability spine: replay historical receipts into peb.governance_events
// and list events for debugging/monitoring.

app.post("/governance/replay", async (_req, res) => {
  try {
    const result = await replayGovernanceEvents();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/governance/events", async (req, res) => {
  try {
    const events = await listGovernanceEvents({
      planId: req.query.planId as string | undefined,
      eventType: req.query.eventType as string | undefined,
      asOf: req.query.asOf as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    });
    res.json({ ok: true, events });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Vision HTTP API (for the Python vision_bridge module) ──────────
// These endpoints are consumed by the LOSM bridge
// (python/tackle/vision_bridge.py) which is the canonical typed writer.

app.post("/vision/work-requests", async (req, res) => {
  try {
    const { id, work_request_uuid, dco_json, context, status } = req.body;
    if (!id) {
      res.status(400).json({ ok: false, error: "Missing required field: id" });
      return;
    }
    const result = await createWorkRequest({
      id,
      work_request_uuid: work_request_uuid || undefined,
      dco_json: dco_json || "{}",
      context: context || {},
      status: status || "pending",
      title: req.body.title || "",
    });
    res.json({ ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/vision/work-requests", async (req, res) => {
  try {
    const wrs = await listWorkRequests({
      planId: req.query.planId as string | undefined,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    });
    res.json({ ok: true, work_requests: wrs });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/vision/work-requests/:id", async (req, res) => {
  try {
    const wr = await getWorkRequest(req.params.id);
    if (!wr) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    res.json({ ok: true, work_request: wr });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/vision/receipts", async (req, res) => {
  try {
    const planId = req.query.planId as string;
    const asOf = req.query.asOf as string | undefined;
    if (!planId) {
      res.status(400).json({ ok: false, error: "Missing required query: planId" });
      return;
    }
    const receipts = await listReceiptsByPlan(planId, asOf);
    res.json({ ok: true, receipts });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /vision/receipts — issue_receipt: validate and insert a receipt.
 * Returns 400 error if validateReceipt rejects the receipt transition.
 * Used by the Python LOSM bridge for standalone work requests
 * that don't have a matching conduit plan. Validates the receipt
 * transition via validateReceipt before inserting, so the typed
 * bridge can issue LOSM-native ExecutionReceipts without creating
 * dummy plans.
 */
app.post("/vision/receipts", async (req, res) => {
  try {
    const { id, plan_id, type, agent_role, session_id, artifact_path, summary, metadata_json, tokens_used, created_at } = req.body;
    if (!id || !plan_id || !type || !agent_role || !created_at) {
      res.status(400).json({ ok: false, error: "Missing required fields: id, plan_id, type, agent_role, created_at" });
      return;
    }
    // Validate receipt transition before inserting
    const validation = await validateReceipt(plan_id, type);
    if (!validation.valid) {
      res.status(400).json({ ok: false, error: validation.error });
      return;
    }
    await api.insertReceipt({
      id, plan_id, type, agent_role,
      session_id: session_id || '',
      ticket_id: req.body.ticket_id || null,
      artifact_path: artifact_path || null,
      summary: summary || '',
      metadata_json: metadata_json || '{}',
      tokens_used: tokens_used ?? 0,
      created_at,
    });
    res.json({ ok: true, id, plan_id });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  RUNTIME KERNEL — WorkRequest lifecycle state machine
// ══════════════════════════════════════════════════════════════════

/**
 * POST /wr/submit — Submit compiler output as a new WorkRequest.
 * Validates the contract boundary (no execution fields in compiler output),
 * creates the WR, appends WR_SUBMITTED event, and returns the initial state.
 */
app.post("/wr/submit", async (req, res) => {
  try {
    const output = req.body;
    // Enforce the compiler/runtime contract boundary
    validateCompilerOutput(output);
    // Convert to event and persist
    const event = compilerOutputToEvent(output);
    // Upsert the work request (idempotent on wrId)
    await createWorkRequest({
      id: event.wrId,
      dco_json: JSON.stringify(output),
      context: { intent: output.intent, constraints: output.constraints, opTrace: output.opTrace },
      status: "draft",
      title: output.intent?.objective || "",
    });
    // Append the WR_SUBMITTED event
    await appendEvent(event.wrId, event.type, event.payload as Record<string, unknown>);
    // Fold events to get current state
    const events = dbEventsToRuntimeEvents(await getEvents(event.wrId));
    const state = foldEvents(event.wrId, events);
    // Broadcast SSE event
    const now = new Date().toISOString();
    watcher.emitToolEvent({
      type: "wr_state_changed",
      data: {
        wrId: event.wrId,
        event: event.type,
        previousStatus: "DRAFT",
        currentStatus: state.status,
        state,
      },
      timestamp: now,
    });
    res.status(201).json({ ok: true, state });
  } catch (err: any) {
    const status = err.message.startsWith("COMPILER_LEAK") ? 422 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

/**
 * GET /wr — List all WorkRequests with optional status filter.
 */
app.get("/wr", async (req, res) => {
  try {
    const { status, limit } = req.query;
    const rows = await listWorkRequestStates({
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    // Fold events for each row to get the authoritative state
    const states: WorkRequestState[] = [];
    for (const row of rows) {
      const events = dbEventsToRuntimeEvents(await getEvents(row.work_request_uuid));
      states.push(foldEvents(row.work_request_uuid, events));
    }
    res.json({ ok: true, count: states.length, states });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /wr/:id — Get the current folded state of a WorkRequest.
 */
app.get("/wr/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rawEvents = await getEvents(id);
    if (rawEvents.length === 0) {
      res.status(404).json({ ok: false, error: `WorkRequest ${id} not found` });
      return;
    }
    const events = dbEventsToRuntimeEvents(rawEvents);
    const state = foldEvents(id, events);
    res.json({ ok: true, state });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /wr/:id/events — Get the raw event log for a WorkRequest.
 */
app.get("/wr/:id/events", async (req, res) => {
  try {
    const { id } = req.params;
    const events = await getEvents(id);
    if (events.length === 0) {
      res.status(404).json({ ok: false, error: `WorkRequest ${id} not found` });
      return;
    }
    res.json({ ok: true, count: events.length, events });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /wr/:id/projection-drift — Check if the live work_request_state
 * projection matches what a full event replay would produce.
 * Non-destructive: computes expected state without writing.
 */
app.get("/wr/:id/projection-drift", async (req, res) => {
  try {
    const { id } = req.params;
    const uuid = await resolveWrUuid(id);
    const drift = await checkProjectionDrift(uuid);
    if (!drift) {
      res.status(404).json({ ok: false, error: `WorkRequest ${id} not found` });
      return;
    }
    res.json({ ok: true, drift });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /wr/:id/transition — Apply a transition event to a WorkRequest.
 * Generic endpoint for manual/supervised transitions.
 * Body: { type: "WR_CLAIMED" | "WR_ACKED" | "WR_SETTLED" | "WR_REJECTED" | "WR_FAILED" | "WR_NOOP" | "WR_DEFERRED", payload?: {} }
 */
app.post("/wr/:id/transition", async (req, res) => {
  try {
    const { id } = req.params;
    const { type, payload } = req.body;
    if (!type) {
      res.status(400).json({ ok: false, error: "Missing required field: type" });
      return;
    }
    // Get current state from event log
    const rawEvents = await getEvents(id);
    if (rawEvents.length === 0) {
      res.status(404).json({ ok: false, error: `WorkRequest ${id} not found` });
      return;
    }
    const events = dbEventsToRuntimeEvents(rawEvents);
    const state = foldEvents(id, events);
    // Validate the transition
    validateTransition(state.status, type);
    // Persist the event
    await appendEvent(id, type, payload || {});
    // Return new state
    const rawNewEvents = await getEvents(id);
    const newEvents = dbEventsToRuntimeEvents(rawNewEvents);
    const newState = foldEvents(id, newEvents);
    // Broadcast SSE event
    const timestamp = new Date().toISOString();
    watcher.emitToolEvent({
      type: "wr_state_changed",
      data: {
        wrId: id,
        event: type,
        previousStatus: state.status,
        currentStatus: newState.status,
        state: newState,
      },
      timestamp,
    });
    res.json({ ok: true, state: newState });
  } catch (err: any) {
    const status = err.message.startsWith("INVALID_TRANSITION") ? 422 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

/**
 * POST /wr/tick — Run ONE tick of the decision loop.
 * Scans for the next runnable WR, applies the decision, returns what happened.
 * This is the "causal loop" entry point — call it on a timer or after any event.
 */
app.post("/wr/tick", async (_req, res) => {
  try {
    const wr = await selectNextRunnable();
    if (!wr) {
      res.json({ ok: true, ticked: false, reason: "no runnable work requests" });
      return;
    }
    // Get current state
    const rawEvents = await getEvents(wr.work_request_uuid);
    const events = dbEventsToRuntimeEvents(rawEvents);
    const state = foldEvents(wr.work_request_uuid, events);
    const decision = decide(state);
    if (!decision) {
      res.json({ ok: true, ticked: false, reason: `state ${state.status} has no automatic transition` });
      return;
    }
    await appendEvent(decision.wrId, decision.type, decision.payload as Record<string, unknown>);
    const rawNewEvents = await getEvents(wr.work_request_uuid);
    const newEvents = dbEventsToRuntimeEvents(rawNewEvents);
    const newState = foldEvents(wr.work_request_uuid, newEvents);
    // Broadcast SSE event
    const now = new Date().toISOString();
    watcher.emitToolEvent({
      type: "wr_state_changed",
      data: {
        wrId: wr.wr_id,
        event: decision.type,
        previousStatus: state.status,
        currentStatus: newState.status,
        state: newState,
      },
      timestamp: now,
    });
    res.json({
      ok: true,
      ticked: true,
      wrId: wr.wr_id,
      event: decision.type,
      previousStatus: state.status,
      currentStatus: newState.status,
      state: newState,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PID file for reliable restarts ───────────────────────────────
// Detects systemd via INVOCATION_ID env var and skips the PID file
// mechanism entirely — systemd tracks PIDs via cgroups and handles
// restart policy.  Outside systemd, kills the previous instance via
// SIGTERM before binding to prevent EADDRINUSE.

const PID_FILE = path.join(PIPELINE_DIR, "mcp-server.pid");

/** True when running under systemd supervision (cgroup-tracked). */
const _underSystemd = !!process.env.INVOCATION_ID;

/** Claim the PID file: kill previous instance if any, then write ours.
 *  Under systemd this is a no-op since systemd manages lifecycle. */
function claimPidFile(): void {
  if (_underSystemd) {
    return; // systemd handles PIDs and restart policy
  }

  // ── Ad-hoc (no systemd): claim by killing previous instance ──
  try {
    if (fs.existsSync(PID_FILE)) {
      const oldPidStr = fs.readFileSync(PID_FILE, "utf-8").trim();
      const oldPid = parseInt(oldPidStr, 10);
      if (!isNaN(oldPid) && oldPid > 0 && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0);
          console.log(`[PID] Previous server PID ${oldPid} still running — killing it.`);
          try {
            process.kill(-oldPid, "SIGTERM");
          } catch {
            process.kill(oldPid, "SIGTERM");
          }
          for (let i = 0; i < 15; i++) {
            try {
              process.kill(oldPid, 0);
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
            } catch {
              break;
            }
          }
          try {
            process.kill(oldPid, 0);
            try {
              process.kill(-oldPid, "SIGKILL");
            } catch {
              process.kill(oldPid, "SIGKILL");
            }
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

  try {
    fs.writeFileSync(PID_FILE, String(process.pid), "utf-8");
    console.log(`[PID] PID ${process.pid} written to ${PID_FILE}`);
  } catch (e: any) {
    console.warn(`[PID] Could not write PID file: ${e.message}`);
  }
}

/** Remove the PID file on graceful shutdown. */
function releasePidFile(): void {
  if (_underSystemd) return;
  try {
    if (fs.existsSync(PID_FILE)) {
      const current = fs.readFileSync(PID_FILE, "utf-8").trim();
      if (current === String(process.pid)) {
        fs.unlinkSync(PID_FILE);
        console.log(`[PID] PID file removed.`);
      }
    }
  } catch {
    // best-effort cleanup
  }
}

// Register shutdown handlers — PID cleanup via exit event, exit via signal
process.on("exit", releasePidFile);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

// Initialize and start
async function start() {
  claimPidFile();
  await watcher.initialize();

  app.listen(PORT, () => {
    console.log(`Watching ${PIPELINE_DIR}...`);
    console.log(`Graph directory: ${GRAPH_DIR}`);
    console.log(`MCP server listening on http://localhost:${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/events`);
    console.log(`State endpoint: http://localhost:${PORT}/state`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  releasePidFile();
  process.exit(1);
});

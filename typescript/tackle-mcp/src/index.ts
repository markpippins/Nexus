import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { loadEnv } from "./env";
import {
  getAIConfigSnapshot,
  getAIProviders,
  getAIProvider,
  getAIHarnesses,
  getAIHarness,
  getAIModels,
  getAIModel,
  getAIRoleConfigs,
  getAIRoleConfig,
  getConfigBundles,
  getConfigBundle,
  getAllConfigBundles,
  upsertAIProvider,
  upsertAIHarness,
  upsertAIModel,
  upsertAIRoleConfig,
  upsertConfigBundles,
  upsertConfigBundle,
  deleteConfigBundle,
  deleteAIProvider,
  deleteAIHarness,
  deleteAIModel,
  deleteAIRoleConfig,
  seedDefaultAIConfig,
  importAIConfig,
  validateAIConfig,
  getBreaker,
  saveFailureRecoveryConfig,
  startSession,
  getSession,
  endSession,
  updateSessionPid,
  getAllSessions,
  getResolvedRoleConfig,
  getRoles,
  getRole,
  upsertRole,
  deleteRole,
} from "./db";
import { initRedis, closeRedis, getRoleCheckpoints } from "./memory";
import { registerToolHandlers, toolDefinitions } from "./tools";
import { getDueSchedulerEntries, updateSchedulerEntry, listSchedulerEntries, createSchedulerEntry, deleteSchedulerEntry } from "./db";

const PORT = parseInt(process.env.PORT || "3400", 10);

const app = express();
app.use(cors());
app.use(express.json());

// ── MCP JSON-RPC endpoint ──────────────────────────────────────

const toolHandlers = registerToolHandlers();

app.post("/", express.json(), async (req, res) => {
  const msg = req.body;
  if (!msg || msg.jsonrpc !== "2.0" || !msg.method) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Invalid Request" },
      id: null,
    });
    return;
  }

  const { method, params, id } = msg;

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
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
          capabilities: { tools: {} },
          serverInfo: { name: "tackle-mcp", version: "1.0.0" },
        });
        break;
      case "tools/list":
        respond({ tools: toolDefinitions });
        break;
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
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`,
    );
  });
  next();
});

// ── Health ─────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  res.json({
    status: "ok",
    port: PORT,
    pid: process.pid,
    timestamp: new Date().toISOString()
  });
});

// ── MCP Memory Updates ─────────────────────────────────────────────

app.get("/api/mcp/memory/role-updates", async (_req, res) => {
  try {
    const roles = await getRoleCheckpoints();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      checkpoints: roles
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Configuration Registry ─────────────────────────────────────

// Full snapshot
app.get("/config/ai", async (_req, res) => {
  res.json(await getAIConfigSnapshot());
});

// Validate
app.get("/config/ai/validate", async (_req, res) => {
  try {
    const warnings = await validateAIConfig();
    res.json({ valid: warnings.length === 0, warnings });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Seed defaults
app.post("/config/ai/seed-defaults", async (req, res) => {
  try {
    const { force } = req.body || {};
    const result = await seedDefaultAIConfig(!!force);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Import full snapshot
app.post("/config/ai/import", async (req, res) => {
  try {
    const { providers, harnesses, models, roles, bundles } = req.body || {};
    if (!providers && !harnesses && !models && !roles) {
      res.status(400).json({ error: "No import data provided" });
      return;
    }
    const result = await importAIConfig({
      providers: providers || [],
      harnesses: harnesses || [],
      models: models || [],
      roles: roles || [],
      bundles: bundles || [],
    });
    res.json({ imported: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Failure Recovery Config ──────────────────────────────────────

app.get("/config/failure-recovery", async (_req, res) => {
  try {
    const breaker = await getBreaker();
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

app.post("/config/failure-recovery", async (req, res) => {
  try {
    const {
      max_retries_per_model,
      retry_delay_seconds,
      max_fallbacks,
      push_back_to_pending,
      circuit_breaker_retry_after,
    } = req.body || {};
    await saveFailureRecoveryConfig({
      max_retries_per_model,
      retry_delay_seconds,
      max_fallbacks,
      push_back_to_pending,
      circuit_breaker_retry_after,
    });
    res.json({ saved: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Test Invoke ────────────────────────────────────────────────────

app.post("/config/ai/test", async (req, res) => {
  try {
    const { model_id, test_prompt } = req.body || {};
    if (!model_id || !test_prompt) {
      res.status(400).json({ error: "model_id and test_prompt are required" });
      return;
    }

    // Look up the model from the DB
    const models = await getAIModels();
    const model = models.find((m: any) => m.id === model_id);
    if (!model) {
      res.status(404).json({ error: `Model ${model_id} not found` });
      return;
    }

    // Look up the harness
    const harnesses = await getAIHarnesses();
    const harness = harnesses.find((h: any) => h.id === model.harness_id);
    if (!harness) {
      res.status(404).json({ error: `Harness ${model.harness_id} not found` });
      return;
    }

    // Resolve harness type from invocation_semantics
    let harnessType = "opencode";
    try {
      const sem = JSON.parse(harness.invocation_semantics || "{}");
      const binary = (sem.binary || "opencode").toLowerCase();
      if (binary.includes("codex")) harnessType = "codex";
      else if (binary.includes("ollama")) harnessType = "ollama";
      else harnessType = "opencode";
    } catch { /* use default */ }

    // Create a test session
    const now = new Date().toISOString();
    const sessionId = `test-${model_id}-${Date.now()}`;
    await startSession({
      id: sessionId,
      agent_role: "test",
      start_iso: now,
      model: model.model_identifier,
    });

    // Direct subprocess spawn — pipe output to session log file
    const projectRoot = process.env.PIPELINE_ROOT || "/home/codex/dev";
    const sessionsDir = path.join(projectRoot, "nexus", ".conduit-data", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sessionLogPath = path.join(sessionsDir, `${sessionId}.log`);
    const logStream = fs.createWriteStream(sessionLogPath, { flags: "a" });

    const proc = spawn(harnessType, [
      "run", "--model", model.model_identifier,
      "--dir", projectRoot,
      "--print-logs", "--log-level", "ERROR",
      test_prompt,
    ], {
      detached: true,
      stdio: ["ignore", logStream, logStream],
    });
    proc.unref();

    if (proc.pid && proc.pid > 0) {
      await updateSessionPid(sessionId, proc.pid);
    }

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] TEST INVOKE model=${model_id} session=${sessionId} pid=${proc.pid} log=${sessionLogPath}`);

    res.json({
      started: true,
      sessionId,
      model_id,
      model_name: model.name,
      model_identifier: model.model_identifier,
      harness: harnessType,
      logPath: `/log/${sessionId}`,
      timestamp,
    });
  } catch (e: any) {
    console.error(`[${new Date().toISOString()}] TEST INVOKE error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Sessions ───────────────────────────────────────────────────────

app.get("/sessions", async (_req, res) => {
  res.json(await getAllSessions());
});

app.post("/sessions/:sessionId/kill", async (req, res) => {
  const { sessionId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const session = await getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session ${sessionId} not found` });
    return;
  }

  if (!session.is_running) {
    res.status(400).json({ killed: false, error: "Session is not running", sessionId });
    return;
  }

  const now = new Date().toISOString();
  const killedPids: number[] = [];
  const errors: string[] = [];

  // Kill the process by PID (safely — pid 0 would signal the process group)
  if (session.pid && session.pid > 0) {
    try {
      process.kill(-session.pid, "SIGKILL");
      killedPids.push(session.pid);
    } catch (e: any) {
      try {
        process.kill(session.pid, "SIGKILL");
        killedPids.push(session.pid);
      } catch (e2: any) {
        errors.push(`PID ${session.pid}: ${e2.message}`);
      }
    }
  }

  await endSession(sessionId, 137, now);

  res.json({
    killed: true,
    sessionId,
    pids: killedPids,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now,
  });
});

// ── Providers ─────────────────────────────────────────────────────

app.get("/config/ai/providers", async (_req, res) => {
  res.json(await getAIProviders());
});

app.get("/config/ai/provider/:id", async (req, res) => {
  try {
    const provider = await getAIProvider(req.params.id);
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }
    res.json(provider);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/config/ai/provider", async (req, res) => {
  try {
    const { id, name, type, endpoint_url, api_key, config_json } = req.body || {};
    if (!id || !name || !type) {
      res.status(400).json({ error: "id, name, and type are required" });
      return;
    }
    await upsertAIProvider({ id, name, type, endpoint_url, api_key, config_json });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/config/ai/provider/:id", async (req, res) => {
  try {
    const deleted = await deleteAIProvider(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Harnesses ─────────────────────────────────────────────────────

app.get("/config/ai/harnesses", async (_req, res) => {
  res.json(await getAIHarnesses());
});

app.get("/config/ai/harness/:id", async (req, res) => {
  try {
    const harness = await getAIHarness(req.params.id);
    if (!harness) {
      res.status(404).json({ error: "Harness not found" });
      return;
    }
    res.json(harness);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/config/ai/harness", async (req, res) => {
  try {
    const { id, name, invocation_semantics } = req.body || {};
    if (!id || !name) {
      res.status(400).json({ error: "id and name are required" });
      return;
    }
    await upsertAIHarness({ id, name, invocation_semantics });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/config/ai/harness/:id", async (req, res) => {
  try {
    const deleted = await deleteAIHarness(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Models ────────────────────────────────────────────────────────

app.get("/config/ai/models", async (_req, res) => {
  res.json(await getAIModels());
});

app.get("/config/ai/model/:id", async (req, res) => {
  try {
    const model = await getAIModel(req.params.id);
    if (!model) {
      res.status(404).json({ error: "Model not found" });
      return;
    }
    res.json(model);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/config/ai/model", async (req, res) => {
  try {
    const { id, name, harness_id, provider_id, model_identifier } = req.body || {};
    if (!id || !name || !harness_id || !model_identifier) {
      res.status(400).json({ error: "id, name, harness_id, and model_identifier are required" });
      return;
    }
    await upsertAIModel({ id, name, harness_id, provider_id, model_identifier });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/config/ai/model/:id", async (req, res) => {
  try {
    const deleted = await deleteAIModel(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Role Configs ─────────────────────────────────────────────────

app.get("/config/ai/roles", async (_req, res) => {
  res.json(await getAIRoleConfigs());
});

app.get("/config/ai/role/:role", async (req, res) => {
  try {
    const role = await getAIRoleConfig(req.params.role);
    if (!role) {
      res.status(404).json({ error: "Role config not found" });
      return;
    }
    res.json(role);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/config/ai/role", async (req, res) => {
  try {
    console.log('[tackle-mcp] POST /config/ai/role body:', JSON.stringify(req.body, null, 2));
    const { id, role, provider_id, harness_id, model_id, extra_params, bundles } = req.body || {};
    console.log('[tackle-mcp] Destructured bundles:', bundles);
    if (!id || !role || !provider_id || !harness_id || !model_id) {
      res.status(400).json({ error: "id, role, provider_id, harness_id, and model_id are required" });
      return;
    }

    if (Array.isArray(bundles) && bundles.length > 0) {
      // Bundles include the primary model — use upsertConfigBundles which handles everything
      console.log('[tackle-mcp] Saving bundles for role:', role, 'count:', bundles.length);
      await upsertConfigBundles(role, bundles);
    } else {
      // No bundles — just save the primary role config
      await upsertAIRoleConfig({ id, role, provider_id, harness_id, model_id, extra_params });
    }

    res.json({ saved: true, id, role });
  } catch (e: any) {
    console.error('[tackle-mcp] Error saving role:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/config/ai/role/:role", async (req, res) => {
  try {
    const deleted = await deleteAIRoleConfig(req.params.role);
    res.json({ deleted, role: req.params.role });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Config Bundles ────────────────────────────────────────────────

// List all bundles
app.get("/config/ai/bundles", async (_req, res) => {
  try {
    res.json(await getAllConfigBundles());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// List bundles for a specific role
app.get("/config/ai/bundles/:role", async (req, res) => {
  try {
    res.json(await getConfigBundles(req.params.role));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get one bundle by id
app.get("/config/ai/bundle/:id", async (req, res) => {
  try {
    const bundle = await getConfigBundle(req.params.id);
    if (!bundle) {
      res.status(404).json({ error: "Bundle not found" });
      return;
    }
    res.json(bundle);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Upsert a bundle
app.post("/config/ai/bundle", async (req, res) => {
  try {
    const { id, name, role, model_id, provider_id, harness_id, priority,
            invocation_mode, command, endpoint_url, timeout_ms,
            valid_from, valid_to, is_active, metadata } = req.body || {};
    if (!id || !name || !role || !model_id) {
      res.status(400).json({ error: "id, name, role, and model_id are required" });
      return;
    }
    await upsertConfigBundle({
      id, name, role, model_id,
      provider_id, harness_id, priority,
      invocation_mode, command, endpoint_url, timeout_ms,
      valid_from, valid_to, is_active, metadata,
    });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a bundle
app.delete("/config/ai/bundle/:id", async (req, res) => {
  try {
    const deleted = await deleteConfigBundle(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bulk upsert bundles for a role ─────────────────────────────────

app.post("/config/ai/bundles/:role", async (req, res) => {
  try {
    const { bundles } = req.body || {};
    if (!Array.isArray(bundles) || bundles.length === 0) {
      res.status(400).json({ error: "bundles array is required" });
      return;
    }
    await upsertConfigBundles(req.params.role, bundles);
    res.json({ saved: true, role: req.params.role, count: bundles.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Roles Registry ─────────────────────────────────────────────────

app.get("/config/roles", async (_req, res) => {
  try {
    const roles = await getRoles();
    res.json({ count: roles.length, roles });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/config/role/:id", async (req, res) => {
  try {
    const role = await getRole(req.params.id);
    if (!role) {
      res.status(404).json({ error: "Role not found" });
      return;
    }
    res.json(role);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/config/role", async (req, res) => {
  try {
    const { id, name, description } = req.body || {};
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const role = await upsertRole({ id, name, description });
    res.json({ saved: true, role });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/config/role/:id", async (req, res) => {
  try {
    const deleted = await deleteRole(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Resolved Config (for agent_chat / Python tackle) ──────────────

app.get("/config/ai/resolve/:role", async (req, res) => {
  try {
    const config = await getResolvedRoleConfig(req.params.role);
    if (!config) {
      res.status(404).json({ error: `No config found for role '${req.params.role}'` });
      return;
    }
    res.json(config);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Agent Scheduler ─────────────────────────────────────────────────

app.get("/scheduler", async (_req, res) => {
  try {
    const entries = await listSchedulerEntries();
    res.json({ count: entries.length, entries });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/scheduler/due", async (_req, res) => {
  try {
    const due = await getDueSchedulerEntries();
    res.json({ count: due.length, entries: due });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/scheduler", async (req, res) => {
  try {
    const { role, model_id, harness, agent_config, schedule_type, schedule_value, project_dir, task_slug, enabled } = req.body || {};
    if (!role) { res.status(400).json({ error: "role is required" }); return; }
    const entry = await createSchedulerEntry({ role, model_id, harness, agent_config, schedule_type, schedule_value, project_dir, task_slug, enabled });
    res.json({ created: true, entry });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/scheduler/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const entry = await updateSchedulerEntry(id, req.body);
    if (!entry) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ updated: true, entry });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/scheduler/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const deleted = await deleteSchedulerEntry(id);
    res.json({ deleted, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Session Log SSE ────────────────────────────────────────────────

app.get("/log/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const projectRoot = process.env.PIPELINE_ROOT || "/home/codex/dev";
  const logPath = path.join(projectRoot, "nexus", ".conduit-data", "sessions", `${sessionId}.log`);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  let lastSize = 0;
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
      for (const line of newContent.split("\n")) {
        if (line.length === 0) continue;
        const event = JSON.stringify({
          type: "session_log",
          data: { sessionId, line, timestamp: new Date().toISOString() },
        });
        res.write(`data: ${event}\n\n`);
      }
    } catch {
      // file may disappear — stop polling
    }
  };

  const logExists = fs.existsSync(logPath);
  res.write(
    `data: ${JSON.stringify({
      type: "session_log_meta",
      data: { sessionId, logFileExists: logExists },
    })}\n\n`,
  );

  if (logExists) {
    sendLines();
  }

  const pollTimer = logExists ? setInterval(() => {
    if (resolved) return;
    sendLines();
  }, 500) : null;

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

// ── Start ─────────────────────────────────────────────────────────

async function start() {
  // DB schema initialization happens here
  const { initDb } = await import("./db");
  await initDb();

  // Initialize Redis for memory procedure registry reads
  initRedis();
  console.log("[memory-mcp] Redis client initialized (lazy connect)");

  app.listen(PORT, () => {
    console.log(`Tackle MCP server listening on http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`AI Config: http://localhost:${PORT}/config/ai`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[tackle-mcp] Shutting down...");
  await closeRedis();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.log("[tackle-mcp] Shutting down...");
  await closeRedis();
  process.exit(0);
});

/**
 * index.ts — Harness SRV: Generic execution harness.
 *
 * Merges Tackle role context (prompt + tool ACL + procedure cards)
 * with Wind task context (inputs + acceptance criteria) and
 * invokes an agent via the configured harness.
 *
 * Port: 3420
 *
 * Routes:
 *   POST /run              — resolve context + execute agent
 *   POST /resolve-context  — resolve context only (dry run)
 *   GET  /health           — health check
 */

import express from "express";
import { resolveContext, resolveRoleModel, emitEvent, pool, redis, checkConfigAdmission, incrementConsumedUnits, emitGovernanceReceipt } from "./db";
import { ADMISSION_OUTCOME } from "./admission";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir, appendFile } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json());

const PORT = parseInt(process.env.HARNESS_PORT || "3420");
const WORK_DIR = process.env.HARNESS_WORK_DIR || "/home/codex/dev";
const PROMPT_DIR = join(WORK_DIR, ".harness", "prompts");

// ── Runaway watchdog (T16 guardrail, 1285 remediation slice 2) ───
const RUNAWAY_THRESHOLD_MS = 15 * 60 * 1000; // 15 min
const WATCHDOG_INTERVAL_MS = 60_000; // check every 60s

interface TrackedSession {
  jobId: string;
  role: string;
  model: string | undefined;
  startedAt: number;
  promptFile: string;
  wind_task_id?: string; // for governance BLOCK receipt on watchdog kill
  pid?: number; // child process PID (set by executeOpencode for direct SIGTERM)
}

const activeSessions = new Map<string, TrackedSession>();

function startWatchdog(): void {
  setInterval(async () => {
    const now = Date.now();
    for (const [jobId, session] of activeSessions) {
      const elapsed = now - session.startedAt;
      if (elapsed < RUNAWAY_THRESHOLD_MS) continue;

      // Check for durable output since launch
      let hasOutput = false;
      try {
        const nebulaUrl = process.env.NEBULA_URL || "http://localhost:3101";
        const since = new Date(session.startedAt).toISOString();
        const resp = await fetch(
          `${nebulaUrl}/api/agent-records?role=${encodeURIComponent(session.role)}&createdAfter=${since}&limit=1`
        );
        const data = await resp.json() as any;
        hasOutput = (data?.items?.length || 0) > 0;
      } catch {
        // Can't reach nebula — assume worst case, don't kill
        continue;
      }

      if (hasOutput) continue; // agent is producing output, not runaway

      // ── Runaway detected — kill + unload ──────────────────────
      await log("warn", `runaway detected: job=${jobId} role=${session.role} elapsed=${Math.round(elapsed/1000)}s — killing`);

      // Kill the child process directly by PID (set by executeOpencode spawn)
      if (session.pid) {
        try {
          process.kill(session.pid, 'SIGTERM');
          await log("info", `runaway kill: SIGTERM sent to pid=${session.pid} job=${jobId.slice(0, 8)}`);
        } catch {
          // Process already dead — that's fine
        }
      }

      // Unload Ollama model if one was in use
      if (session.model) {
        try {
          const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
          await fetch(`${ollamaUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: session.model, keep_alive: 0 }),
          });
        } catch {
          // best-effort unload
        }
      }

      // Emit runaway detection record
      const exhaustId = uuidv4();
      const isoNow = new Date().toISOString();
      try {
        await pool.query(
          `INSERT INTO nebula.agent_records_history (id, record_type, role, title, content, tags, created_at, recorded_on_dt)
           VALUES ($1::uuid, 'report', 'architect', $2, $3, $4, $5, $5)`,
          [
            exhaustId,
            `Runaway agent killed: ${session.role} (job ${jobId.slice(0, 8)})`,
            `## Runaway agent detected + killed

- **Job:** ${jobId}
- **Role:** ${session.role}
- **Model:** ${session.model || 'unknown'}
- **Elapsed:** ${Math.round(elapsed / 1000)}s
- **Threshold:** ${RUNAWAY_THRESHOLD_MS / 1000}s

No agent records were produced since launch. The process was killed and the model unloaded.`,
            ['type:runaway-detected', 'to:architect', 'to:engineer', `role:${session.role}`],
            isoNow
          ]
        );
      } catch {
        // best-effort record
      }

      // Governance BLOCK receipt — the killed run is an abnormal
      // completion; BLOCK is the always-valid override receipt type
      // (watchdog is whitelisted as a receipt-issuing executor in
      // tackle.vision_bridge._PASS_THROUGH_EXECUTORS).
      if (session.wind_task_id) {
        emitGovernanceReceipt({
          planId: session.wind_task_id,
          type: "BLOCK",
          agentRole: "watchdog",
          sessionId: jobId,
          summary: `runaway watchdog kill: ${session.role} (job ${jobId.slice(0, 8)})`,
          metadata: {
            stage: "watchdog_kill",
            role: session.role,
            model: session.model || "unknown",
            elapsed_ms: elapsed,
          },
        });
      }

      activeSessions.delete(jobId);
    }
  }, WATCHDOG_INTERVAL_MS);
  log("info", `watchdog started (threshold=${RUNAWAY_THRESHOLD_MS}ms, interval=${WATCHDOG_INTERVAL_MS}ms)`);
}

// ── File logging (nexus/logs/harness-srv.log) ─────────────────────
const LOG_DIR = process.env.NEXUS_LOG_DIR || "/home/codex/dev/nexus/logs";
const LOG_FILE = join(LOG_DIR, "harness-srv.log");
mkdir(LOG_DIR, { recursive: true }).catch(() => {});

async function log(level: "info" | "warn" | "error", message: string): Promise<void> {
  const line = `[harness-srv] ${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  console.log(line);
  try {
    await appendFile(LOG_FILE, line + "\n", "utf-8");
  } catch {
    // Log dir/file unavailable — journald/stdout still captured
  }
}

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`harness-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[harness-srv] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[harness-srv] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

// ── POST /run ───────────────────────────────────────────────────────

/**
 * Run an agent job.
 *
 * Body:
 *   wind_task_id: string    — wind.tasks.id to execute
 *   context?: object        — additional context to merge into input_spec
 *   work_dir?: string       — working directory override
 *   harness_id?: string     — harness override (default: harn-opencode)
 *   agent?: string          — agent name override (for opencode)
 *   timeout_ms?: number     — execution timeout (default: 300000 = 5 min)
 *
 * Returns:
 *   { job_id, role, task, prompt_preview, exit_code, stdout, stderr, events }
 */
app.post("/run", async (req, res) => {
  const jobId = uuidv4();
  const startTime = Date.now();

  try {
    const {
      wind_task_id,
      context: contextOverrides,
      work_dir,
      harness_id,
      agent,
      timeout_ms = 300_000,
    } = req.body;
    const resolveOnly = req.body.resolve_only === true;

    if (!wind_task_id) {
      return res.status(400).json({ error: "wind_task_id is required" });
    }

    // 1. Resolve context
    const resolved = await resolveContext(wind_task_id, contextOverrides);

    // ── Interactive-hosted guard (Freebuff roles, plan 1286 follow-up) ─
    // Roles whose config_bundle resolves to invocation_mode=INTERACTIVE
    // (harness harn-freebuff) run INSIDE Freebuff — they are never
    // launched by harness-srv. Refuse before any spawn happens.
    if (resolved.model?.invocation_mode === "INTERACTIVE") {
      await log(
        "warn",
        `run job=${jobId} role=${resolved.role} — INTERACTIVE-hosted role (Freebuff); refusing harness launch`
      );
      return res.status(400).json({
        job_id: jobId,
        error: `role ${resolved.role} is INTERACTIVE-hosted (Freebuff) — cannot be launched via harness-srv; run it in the Freebuff interactive session instead`,
      });
    }

    // ── Admission gate (T20 two-tier): config validity, uniform across paths ──
    const configAdmission = await checkConfigAdmission(resolved.role);
    if (!configAdmission.valid) {
      await log(
        "warn",
        `run job=${jobId} role=${resolved.role} — admission denied: ${configAdmission.outcome}`
      );
      await emitEvent({
        event_type: "admission.denied",
        source: "harness-srv.run",
        aggregate_type: "harness_job",
        aggregate_id: jobId,
        payload: {
          wind_task_id,
          role: resolved.role,
          outcome: ADMISSION_OUTCOME.ADMISSION_DENIED,
          reason: configAdmission.outcome,
        },
        actor_type: "system",
      });
      // BLOCK is the always-valid terminal receipt and a valid first receipt
      // for a fresh plan_id — durable "admission denied" audit trail.
      await emitGovernanceReceipt({
        planId: wind_task_id,
        type: "BLOCK",
        agentRole: resolved.role,
        sessionId: jobId,
        summary: `harness-srv ${jobId.slice(0, 8)}: admission denied (${configAdmission.outcome})`,
        metadata: {
          stage: "admission_denied",
          wind_task_id,
          outcome: ADMISSION_OUTCOME.ADMISSION_DENIED,
          reason: configAdmission.outcome,
        },
      });
      return res.status(403).json({
        job_id: jobId,
        error: configAdmission.message,
        admission: {
          outcome: ADMISSION_OUTCOME.ADMISSION_DENIED,
          reason: configAdmission.outcome,
        },
      });
    }

    // 2. Merge overrides
    const effectiveHarnessId = harness_id || resolved.harness_id;
    const effectiveWorkDir = work_dir || WORK_DIR;
    const effectiveAgent = agent || resolved.role;
    const effectiveModel = resolved.model?.opencode_model_id;

    await log(
      "info",
      `run job=${jobId} role=${resolved.role} task=${resolved.task.task_slug} model=${effectiveModel ?? "(harness default)"} wind_task=${wind_task_id}`
    );

    // 3. Emit harness.started event
    const startedEventId = await emitEvent({
      event_type: "harness.started",
      source: "harness-srv.run",
      aggregate_type: "harness_job",
      aggregate_id: jobId,
      payload: {
        wind_task_id,
        role: resolved.role,
        task_slug: resolved.task.task_slug,
        harness_id: effectiveHarnessId,
      },
      actor_type: "system",
    });

    // Governance PLAN_CREATE — bootstrap the receipt lifecycle for the
    // wind_task_id (fresh plan id → PLAN_CREATE is the only valid first
    // receipt). Skipped for resolve_only dry-runs: no work unit runs.
    if (!resolveOnly) {
      await emitGovernanceReceipt({
        planId: wind_task_id,
        type: "PLAN_CREATE",
        agentRole: resolved.role,
        sessionId: jobId,
        summary: `harness-srv ${jobId.slice(0, 8)}: run started (${resolved.task.task_slug})`,
        metadata: {
          stage: "run_start",
          wind_task_id,
          task_slug: resolved.task.task_slug,
          harness_id: effectiveHarnessId,
        },
      });
    }

    // 4. Append outcome instruction to prompt and write to temp file
    const outcomeInstruction = buildOutcomeInstruction(resolved.outcomes || []);
    const fullPrompt = resolved.prompt + "\n\n" + outcomeInstruction;
    await mkdir(PROMPT_DIR, { recursive: true });
    const promptFile = join(PROMPT_DIR, `${jobId}.md`);
    await writeFile(promptFile, fullPrompt, "utf-8");

    // 5. Execute via harness (or resolve-only mode)
    let exitCode = 0;
    let stdout = "";
    let stderr = "";

    if (resolveOnly) {
      // Skip execution — return resolved context only
      stdout = JSON.stringify({
        role: resolved.role,
        prompt_length: resolved.prompt.length,
        task: resolved.task,
        procedure_cards: resolved.prompt.match(/^- \*\*/gm)?.length || 0,
      });
    } else {
      // ── Register session for runaway watchdog ──────────────────
      activeSessions.set(jobId, {
        jobId,
        role: resolved.role,
        model: effectiveModel,
        startedAt: startTime,
        promptFile,
        wind_task_id,
      });

      try {
        const result = await executeHarness({
          harness_id: effectiveHarnessId,
          prompt_file: promptFile,
          work_dir: effectiveWorkDir,
          agent: effectiveAgent,
          role: resolved.role,
          model: effectiveModel,
          model_identifier: resolved.model?.model_identifier,
          timeout_ms,
        });
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = result.exitCode;
      } catch (execError: any) {
        exitCode = execError.exitCode || 1;
        stdout = execError.stdout || "";
        stderr = execError.stderr || execError.message;
      } finally {
        activeSessions.delete(jobId);
      }
    }

    // Clean up prompt file
    await unlink(promptFile).catch(() => {});

    // 6. Emit harness.completed event
    await emitEvent({
      event_type: exitCode === 0 ? "harness.completed" : "harness.failed",
      source: "harness-srv.run",
      aggregate_type: "harness_job",
      aggregate_id: jobId,
      payload: {
        wind_task_id,
        role: resolved.role,
        task_slug: resolved.task.task_slug,
        exit_code: exitCode,
        duration_ms: Date.now() - startTime,
        stdout_preview: stdout.slice(0, 500),
        stderr_preview: stderr.slice(0, 500),
      },
      actor_type: "system",
      causation_id: startedEventId,
      caused_by_event_type: "harness.started",
    });

    await log(
      exitCode === 0 ? "info" : "warn",
      `run job=${jobId} role=${resolved.role} exit=${exitCode} duration_ms=${Date.now() - startTime} model=${effectiveModel ?? "(harness default)"}`
    );

    // 6b. Governance completion receipts — IMPLEMENTATION then
    // REVIEW_PASS (exit 0) / REVIEW_REJECT (exit != 0), walked in the
    // order validateReceipt requires. Best-effort + sequential so the
    // chain lands in peb.governance_events like every other channel.
    if (!resolveOnly) {
      const durationMs = Date.now() - startTime;
      const completedMetadata = {
        stage: "run_complete",
        wind_task_id,
        task_slug: resolved.task.task_slug,
        harness_id: effectiveHarnessId,
        exit_code: exitCode,
        duration_ms: durationMs,
        stdout_preview: stdout.slice(0, 300),
        stderr_preview: stderr.slice(0, 300),
      };
      await emitGovernanceReceipt({
        planId: wind_task_id,
        type: "IMPLEMENTATION",
        agentRole: resolved.role,
        sessionId: jobId,
        summary: `harness-srv ${jobId.slice(0, 8)}: implementation ${exitCode === 0 ? "ok" : "failed"} (${resolved.task.task_slug})`,
        metadata: completedMetadata,
      });
      await emitGovernanceReceipt({
        planId: wind_task_id,
        type: exitCode === 0 ? "REVIEW_PASS" : "REVIEW_REJECT",
        agentRole: resolved.role,
        sessionId: jobId,
        summary: `harness-srv ${jobId.slice(0, 8)}: ${exitCode === 0 ? "completed" : "failed"} exit=${exitCode} (${resolved.task.task_slug})`,
        metadata: completedMetadata,
      });
    }

    // 7. Parse outcome from agent output
    const parsedOutcome = parseOutcome(stdout, resolved.outcomes || []);

    // 8. Return result
    res.json({
      job_id: jobId,
      role: resolved.role,
      task: {
        wind_task_id: resolved.task.wind_task_id,
        wind_task_name: resolved.task.wind_task_name,
        task_slug: resolved.task.task_slug,
        scope: resolved.task.scope,
      },
      outcomes: (resolved.outcomes || []).map((o) => ({ code: o.code, description: o.description })),
      outcome: parsedOutcome, // { code, id, confidence } or null
      prompt_preview: resolved.prompt.slice(0, 300) + "...",
      harness_id: effectiveHarnessId,
      exit_code: exitCode,
      stdout,
      stderr,
      duration_ms: Date.now() - startTime,
      events: { started: startedEventId },
    });
  } catch (error: any) {
    // Emit harness.error event
    await emitEvent({
      event_type: "harness.error",
      source: "harness-srv.run",
      aggregate_type: "harness_job",
      aggregate_id: jobId,
      payload: { error: error.message },
      actor_type: "system",
    }).catch(() => {});

    res.status(500).json({
      job_id: jobId,
      error: error.message,
      duration_ms: Date.now() - startTime,
    });
  }
});

// ── POST /resolve-context ───────────────────────────────────────────

/**
 * Resolve context without executing. Useful for debugging.
 *
 * Body:
 *   wind_task_id: string
 */
app.post("/resolve-context", async (req, res) => {
  try {
    const { wind_task_id } = req.body;
    if (!wind_task_id) {
      return res.status(400).json({ error: "wind_task_id is required" });
    }

    const resolved = await resolveContext(wind_task_id);

    res.json({
      role: resolved.role,
      task: resolved.task,
      prompt_length: resolved.prompt.length,
      prompt_preview: resolved.prompt.slice(0, 500) + "...",
      procedure_cards: resolved.prompt.includes("(no procedure cards")
        ? 0
        : (resolved.prompt.match(/^- \*\*/gm) || []).length,
      harness_id: resolved.harness_id,
      tool_acl: resolved.task,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /run-direct ────────────────────────────────────────────────

/**
 * Run an agent with raw context — no wind task resolution required.
 *
 * For interactive conversation turns (Duality/Plurality) where the
 * subscriber already assembled the full prompt from Assembly thread
 * context. Bypasses wind.task lookup entirely.
 *
 * Body:
 *   role: string           — agent role (maps to tackle config_bundle)
 *   prompt: string         — full prompt text (already assembled)
 *   model?: string         — model override (from tackle config_bundle)
 *   work_dir?: string      — working directory override
 *   agent?: string         — agent name override (for opencode)
 *   timeout_ms?: number    — execution timeout (default: 300000 = 5 min)
 *   channel?: string       — invocation channel (default: "duality")
 *
 * Returns:
 *   { job_id, role, exit_code, stdout, stderr, duration_ms, prompt_preview }
 */
app.post("/run-direct", async (req, res) => {
  const jobId = uuidv4();
  const startTime = Date.now();

  try {
    const {
      role,
      prompt,
      model: modelOverride,
      work_dir,
      agent,
      timeout_ms = 600_000,
      channel = "duality",
    } = req.body;

    if (!role) {
      return res.status(400).json({ error: "role is required" });
    }
    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    // ── Admission gate (T20 two-tier): config validity, uniform across paths ──
    const configAdmission = await checkConfigAdmission(role);
    if (!configAdmission.valid) {
      await log(
        "warn",
        `run-direct job=${jobId} role=${role} — admission denied: ${configAdmission.outcome}`
      );
      await emitEvent({
        event_type: "admission.denied",
        source: `harness-srv.run-direct.${channel}`,
        aggregate_type: "harness_job",
        aggregate_id: jobId,
        payload: {
          role,
          channel,
          outcome: ADMISSION_OUTCOME.ADMISSION_DENIED,
          reason: configAdmission.outcome,
        },
        actor_type: "system",
      });
      return res.status(403).json({
        job_id: jobId,
        error: configAdmission.message,
        admission: {
          outcome: ADMISSION_OUTCOME.ADMISSION_DENIED,
          reason: configAdmission.outcome,
        },
      });
    }

    // ── Resolve the role's model/harness config from tackle ──────
    // Reuse resolveRoleModel — the same resolver as the /run workflow path —
    // so both paths agree on the SAME primary bundle, model wire id, and
    // harness. (Previously this ran its own SQL with `ORDER BY priority DESC`,
    // which inverted the primary-bundle selection vs resolveRoleModel's
    // ascending priority sort — picking the fallback model instead of the
    // primary. One role reference must resolve deterministically, T20.)
    const modelConfig = await resolveRoleModel(role);

    if (!modelConfig) {
      await log("warn", `run-direct job=${jobId} role=${role} — no active config_bundle found`);
      return res.status(400).json({
        job_id: jobId,
        error: `No active config_bundle found for role ${role}`,
      });
    }

    const harnessId = modelConfig.harness_id;
    // Explicit modelOverride values are passed through as-is: callers must
    // supply an opencode-formatted id (e.g. `opencode/big-pickle`). Otherwise
    // the canonical opencode_model_id from resolveRoleModel is used.
    const effectiveModel = modelOverride || modelConfig.opencode_model_id;
    const invocationMode = modelConfig.invocation_mode;

    // ── Interactive-hosted guard ─────────────────────────────────
    // invocation_mode is a column on tackle.config_bundle (not on
    // harnesses.invocation_semantics). It's set when a role is
    // configured to run inside Freebuff rather than via harness-srv.
    if (invocationMode === "INTERACTIVE") {
      await log("warn", `run-direct job=${jobId} role=${role} — INTERACTIVE-hosted; refusing harness launch`);
      return res.status(400).json({
        job_id: jobId,
        error: `role ${role} is INTERACTIVE-hosted (Freebuff) — use freebuff backend instead`,
      });
    }

    const effectiveWorkDir = work_dir || WORK_DIR;
    const effectiveAgent = agent || role;

    await log("info", `run-direct job=${jobId} role=${role} model=${effectiveModel ?? "(harness default)"} channel=${channel}`);

    // 1. Emit harness.started event
    const startedEventId = await emitEvent({
      event_type: "harness.started",
      source: `harness-srv.run-direct.${channel}`,
      aggregate_type: "harness_job",
      aggregate_id: jobId,
      payload: { role, channel, prompt_length: prompt.length },
      actor_type: "system",
    });

    // 2. Write prompt to temp file
    await mkdir(PROMPT_DIR, { recursive: true });
    const promptFile = join(PROMPT_DIR, `${jobId}.md`);
    await writeFile(promptFile, prompt, "utf-8");

    // 3. Register for watchdog
    activeSessions.set(jobId, {
      jobId,
      role,
      model: effectiveModel,
      startedAt: startTime,
      promptFile,
    });

    // 4. Execute via harness
    let exitCode = 0;
    let stdout = "";
    let stderr = "";

    try {
      const result = await executeHarness({
        harness_id: harnessId,
        prompt_file: promptFile,
        work_dir: effectiveWorkDir,
        agent: effectiveAgent,
        role,
        model: effectiveModel,
        model_identifier: modelConfig.model_identifier,
        timeout_ms,
      });
      stdout = result.stdout;
      stderr = result.stderr;
      exitCode = result.exitCode;
    } catch (execError: any) {
      exitCode = execError.exitCode || 1;
      stdout = execError.stdout || "";
      stderr = execError.stderr || execError.message;
    } finally {
      activeSessions.delete(jobId);
    }

    await unlink(promptFile).catch(() => {});

    // 5. Emit harness.completed event
    await emitEvent({
      event_type: exitCode === 0 ? "harness.completed" : "harness.failed",
      source: `harness-srv.run-direct.${channel}`,
      aggregate_type: "harness_job",
      aggregate_id: jobId,
      payload: {
        role,
        channel,
        exit_code: exitCode,
        duration_ms: Date.now() - startTime,
        stdout_preview: stdout.slice(0, 500),
        stderr_preview: stderr.slice(0, 500),
      },
      actor_type: "system",
      causation_id: startedEventId,
      caused_by_event_type: "harness.started",
    });

    await log(
      exitCode === 0 ? "info" : "warn",
      `run-direct job=${jobId} role=${role} exit=${exitCode} duration_ms=${Date.now() - startTime}`
    );

    res.json({
      job_id: jobId,
      role,
      exit_code: exitCode,
      stdout,
      stderr,
      duration_ms: Date.now() - startTime,
      prompt_preview: prompt.slice(0, 300) + (prompt.length > 300 ? "..." : ""),
      harness_id: harnessId,
      model: effectiveModel || null,
      events: { started: startedEventId },
    });
  } catch (error: any) {
    await emitEvent({
      event_type: "harness.error",
      source: "harness-srv.run-direct",
      aggregate_type: "harness_job",
      aggregate_id: jobId,
      payload: { error: error.message },
      actor_type: "system",
    }).catch(() => {});

    res.status(500).json({
      job_id: jobId,
      error: error.message,
      duration_ms: Date.now() - startTime,
    });
  }
});

// ── GET /health ─────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    await redis.ping();
    res.json({ status: "ok", port: PORT, uptime: process.uptime() });
  } catch (error: any) {
    res.status(503).json({ status: "error", error: error.message });
  }
});

// ── GET /sessions — active session list (runaway watchdog visibility)
app.get("/sessions", (_req, res) => {
  const sessions = Array.from(activeSessions.values()).map((s) => ({
    jobId: s.jobId,
    role: s.role,
    model: s.model || null,
    startedAt: new Date(s.startedAt).toISOString(),
    elapsedSeconds: Math.round((Date.now() - s.startedAt) / 1000),
  }));
  res.json({ sessions, count: sessions.length });
});

// ── Harness execution ───────────────────────────────────────────────

interface HarnessExecParams {
  harness_id: string;
  prompt_file: string;
  work_dir: string;
  agent: string;
  role: string;
  model?: string; // opencode --model value (from tackle config_bundle)
  model_identifier?: string; // bare model_identifier (for binary=ollama)
  timeout_ms: number;
}

interface HarnessExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function executeHarness(params: HarnessExecParams): Promise<HarnessExecResult> {
  const { harness_id, prompt_file, work_dir, agent, role, timeout_ms } = params;

  // Read the prompt content from file
  const promptContent = await readFile(prompt_file, "utf-8");

  // Get harness config from DB
  const result = await pool.query(
    `SELECT invocation_semantics FROM tackle.harnesses WHERE id = $1`,
    [harness_id]
  );

  if (result.rows.length === 0) {
    throw new Error(`Harness ${harness_id} not found in tackle.harnesses`);
  }

  const config =
    typeof result.rows[0].invocation_semantics === "string"
      ? JSON.parse(result.rows[0].invocation_semantics)
      : result.rows[0].invocation_semantics;

  const binary = config.binary;

  // Route to the right executor. The resolved model (from tackle
  // config_bundle) is honored on both paths — opencode via --model, and
  // ollama via the model_identifier passed to the generate API.
  if (binary === "ollama") {
    // Ollama's /api/generate expects the bare model_identifier (e.g.
    // `qwen2.5-coder`), not the opencode-qualified wire id
    // (`ollama/qwen2.5-coder`) — feeding the latter 404s.
    return executeOllama(
      promptContent,
      role,
      params.model_identifier ?? params.model,
      timeout_ms
    );
  } else if (binary === "opencode") {
    return executeOpencode(params, promptContent);
  } else {
    throw new Error(`Harness ${harness_id} binary '${binary}' not yet supported`);
  }
}

/**
 * Execute via ollama HTTP API directly (no opencode, no tool access).
 * This is the fast path for CPU-only environments.
 */
async function executeOllama(
  prompt: string,
  role: string,
  model: string | undefined,
  timeout_ms: number
): Promise<HarnessExecResult> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const effectiveModel = model || process.env.OLLAMA_MODEL || "qwen2.5:0.5b";

  await log("info", `ollama exec role=${role} model=${effectiveModel}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout_ms);

    const resp = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: effectiveModel,
        prompt,
        stream: false,
        options: {
          num_predict: 1024,
          temperature: 0.3,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      const body = await resp.text();
      return { exitCode: 1, stdout: "", stderr: `Ollama error (${resp.status}): ${body}` };
    }

    const data = await resp.json() as any;
    // ── consumed_units tracking (RoleLeases plan 1286) ──────────
    incrementConsumedUnits(role).catch(() => {});
    return {
      exitCode: 0,
      stdout: data.response || "",
      stderr: "",
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      return { exitCode: 124, stdout: "", stderr: `Ollama timeout after ${timeout_ms}ms` };
    }
    return { exitCode: 1, stdout: "", stderr: error.message };
  }
}

/**
 * Execute via opencode CLI (full tool access, requires GPU for reasonable speed).
 * When a model was resolved from tackle config_bundle it is passed via --model,
 * so external-provider changes made in tackle-ui take effect on harness runs.
 *
 * Uses child_process.spawn (not execFile) so the T16 runaway watchdog can
 * directly SIGTERM the child process by PID instead of pattern-matching pkill.
 */
async function executeOpencode(
  params: HarnessExecParams,
  promptContent: string
): Promise<HarnessExecResult> {
  const { prompt_file, work_dir, agent, role, model, timeout_ms } = params;
  const opencodeBin = process.env.OPENCODE_BIN || "opencode";
  // Extract jobId from prompt filename (${jobId}.md) for watchdog PID tracking
  const jobId = prompt_file.split("/").pop()?.replace(".md", "") || "";

  // NOTE (opencode 1.18.x): `opencode run [message..]` requires the prompt as
  // a message. We pipe the prompt via stdin instead of passing it as a
  // positional arg: opencode's resolveRunInput() uses piped stdin when the
  // positional message is empty, and piping avoids argv-length limits (E2BIG)
  // for large Assembly-thread prompts.
  //
  // `--file` is deliberately NOT passed: (a) the prompt file only contains the
  // same text we already deliver as the message, so attaching it adds nothing;
  // and (b) empirically, passing `--file` breaks model resolution for custom
  // config providers (`Model not found: <provider>/<model>`) — with --file,
  // opencode 1.18.16 resolves the model against a provider registry that has
  // not yet loaded config providers. The prompt file stays on disk for jobId/
  // watchdog bookkeeping (prompt_file.split("/").pop() below).
  const cmdArgs = [
    "run",
    "--agent", agent,
    ...(model ? ["--model", model] : []),
    "--dir", work_dir,
    "--format", "json",
    "--dangerously-skip-permissions",
  ];

  await log("info", `opencode exec agent=${agent} model=${model ?? "(unset)"} file=${prompt_file} dir=${work_dir} bin=${opencodeBin} prompt_chars=${promptContent.length}`);

  return new Promise((resolve) => {
    const child = spawn(opencodeBin, cmdArgs, {
      cwd: work_dir,
      env: {
        ...process.env,
        HARNESS_ROLE: role,
        HARNESS_JOB_ID: prompt_file.split("/").pop()?.replace(".md", "") || "",
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Pipe the prompt as the run message (opencode reads non-TTY stdin as the
    // message via resolveRunInput). Ignore EPIPE — the child may exit early.
    if (child.stdin) {
      child.stdin.on("error", () => { /* child may have exited early */ });
      child.stdin.write(promptContent);
      child.stdin.end();
    }

    // Register PID for runaway watchdog (direct SIGTERM instead of pkill -f)
    if (jobId) {
      const session = activeSessions.get(jobId);
      if (session) {
        session.pid = child.pid;
        log("info", `opencode pid=${child.pid} registered for watchdog (job=${jobId.slice(0, 8)})`);
      }
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Give it 5s to exit gracefully, then force-kill
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5000);
    }, timeout_ms);

    child.on('close', (code) => {
      clearTimeout(timer);
      let exitCode = code ?? 1;
      let stderrOut = stderr;
      if (timedOut) {
        // A signal-killed child reports code=null, which otherwise surfaces
        // as a misleading '(no stderr; exit 1)'. Mirror the ollama path's
        // exitCode 124 + message so callers know this was a timeout, and
        // keep the partial stdout for the caller to surface.
        exitCode = 124;
        stderrOut = `opencode timeout after ${timeout_ms}ms — partial output below`;
      } else if (code === null) {
        // Killed by a signal outside the timeout (e.g. the 15-min runaway
        // watchdog or an external kill) — report it honestly too instead of
        // the generic exit 1.
        exitCode = 137;
        stderrOut = 'opencode killed by signal (watchdog or external kill) — partial output below';
      }
      if (exitCode === 0) {
        incrementConsumedUnits(role).catch(() => {});
      }
      resolve({ exitCode, stdout, stderr: stderrOut });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

// ── Outcome helpers ─────────────────────────────────────────────────

/**
 * Build instruction text telling the agent to emit an OUTCOME line.
 */
function buildOutcomeInstruction(outcomes: { code: string; description: string }[]): string {
  if (outcomes.length === 0) return "";
  const codes = outcomes.map((o) => o.code).join(", ");
  const descriptions = outcomes
    .map((o) => `  - ${o.code}: ${o.description}`)
    .join("\n");
  return `## Outcome Declaration

When you have completed your analysis, you MUST end your response with a line
in exactly this format:

OUTCOME: <code>

Where <code> is one of: ${codes}

Outcome descriptions:
${descriptions}

Choose the outcome that best reflects your conclusion.`;
}

/**
 * Parse the agent's output for an OUTCOME: <code> line.
 * Returns the matched outcome or null.
 */
function parseOutcome(
  output: string,
  outcomes: { id: string; code: string; description: string }[]
): { code: string; id: string; confidence: string } | null {
  // Look for "OUTCOME: <code>" in the last few lines
  const lines = output.trim().split("\n");
  const lastLines = lines.slice(-10); // check last 10 lines

  for (const line of lastLines) {
    const match = line.trim().match(/^OUTCOME:\s*(\w[\w-]*)\s*$/i);
    if (match) {
      const code = match[1].toLowerCase();
      const outcome = outcomes.find((o) => o.code === code);
      if (outcome) {
        return { code: outcome.code, id: outcome.id, confidence: "exact" };
      }
      // Close match (ignore case, underscores)
      const fuzzy = outcomes.find(
        (o) => o.code.replace(/_/g, "-") === code.replace(/_/g, "-")
      );
      if (fuzzy) {
        return { code: fuzzy.code, id: fuzzy.id, confidence: "fuzzy" };
      }
    }
  }

  // Fallback: keyword scan in full output
  for (const outcome of outcomes) {
    // SECURITY: escape regex metacharacters in outcome.code before interpolation
    const escapedCode = outcome.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedCode.replace(/_/g, "[-_]?")}\\b`, "i");
    if (pattern.test(output)) {
      return { code: outcome.code, id: outcome.id, confidence: "keyword" };
    }
  }

  return null;
}

// ── Start ───────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[harness-srv] listening on port ${PORT}`);
  console.log(`[harness-srv] work dir: ${WORK_DIR}`);
  console.log(`[harness-srv] prompt dir: ${PROMPT_DIR}`);
  log("info", `listening on port ${PORT} (work dir: ${WORK_DIR}, log: ${LOG_FILE})`);
  startWatchdog();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`harness-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    console.error('harness-srv: listen error:', err.message);
  }
  process.exit(1);
});

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
import { resolveContext, emitEvent, pool, redis, checkRoleLease, incrementConsumedUnits } from "./db";
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

      // Kill opencode processes tied to this prompt file
      try {
        await execFileAsync("pkill", ["-f", `opencode.*${session.promptFile.split("/").pop()}`]);
      } catch {
        // pkill returns non-zero when no match — that's fine
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

    if (!wind_task_id) {
      return res.status(400).json({ error: "wind_task_id is required" });
    }

    // 1. Resolve context
    const resolved = await resolveContext(wind_task_id, contextOverrides);

    // ── Role-lease guard (RoleLeases plan 1286, slice 3) ─────────────
    const lease = await checkRoleLease(resolved.role);
    if (!lease) {
      await log(
        "warn",
        `run job=${jobId} role=${resolved.role} — no active role lease (proceeding anyway; lease-less runs will be gated in a follow-up)`
      );
    } else if (lease.expired || lease.exhausted) {
      await log(
        "warn",
        `run job=${jobId} role=${resolved.role} — role lease ${lease.expired ? "EXPIRED" : "EXHAUSTED"} (window_end=${lease.window_end}, consumed=${lease.consumed_units}/${lease.budget_units ?? "unlimited"}) — proceeding but lease should be renewed`
      );
    } else {
      await log(
        "info",
        `run job=${jobId} role=${resolved.role} — active lease ok (consumed=${lease.consumed_units}/${lease.budget_units ?? "unlimited"}, window_end=${lease.window_end})`
      );
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

    const resolveOnly = req.body.resolve_only === true;

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
      });

      try {
        const result = await executeHarness({
          harness_id: effectiveHarnessId,
          prompt_file: promptFile,
          work_dir: effectiveWorkDir,
          agent: effectiveAgent,
          role: resolved.role,
          model: effectiveModel,
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
    return executeOllama(promptContent, role, params.model, timeout_ms);
  } else if (binary === "opencode") {
    return executeOpencode(params);
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
 */
async function executeOpencode(params: HarnessExecParams): Promise<HarnessExecResult> {
  const { prompt_file, work_dir, agent, role, model, timeout_ms } = params;
  const opencodeBin = process.env.OPENCODE_BIN || "opencode";

  const cmdArgs = [
    "run",
    "--agent", agent,
    ...(model ? ["--model", model] : []),
    "--dir", work_dir,
    "--format", "json",
    "--file", prompt_file,
    "--dangerously-skip-permissions",
    "",
  ];

  await log("info", `opencode exec agent=${agent} model=${model ?? "(unset)"} file=${prompt_file} dir=${work_dir} bin=${opencodeBin}`);

  try {
    const { stdout, stderr } = await execFileAsync(
      opencodeBin,
      cmdArgs,
      {
        cwd: work_dir,
        timeout: timeout_ms,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          HARNESS_ROLE: role,
          HARNESS_JOB_ID: prompt_file.split("/").pop()?.replace(".md", "") || "",
        },
      }
    );

    // ── consumed_units tracking (RoleLeases plan 1286) ──────────
    incrementConsumedUnits(role).catch(() => {});
    return { exitCode: 0, stdout, stderr };
  } catch (error: any) {
    return {
      exitCode: error.code || 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
    };
  }
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

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
import { resolveContext, emitEvent, pool, redis } from "./db";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json());

const PORT = parseInt(process.env.HARNESS_PORT || "3420");
const WORK_DIR = process.env.HARNESS_WORK_DIR || "/home/codex/dev";
const PROMPT_DIR = join(WORK_DIR, ".harness", "prompts");

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

    // 2. Merge overrides
    const effectiveHarnessId = harness_id || resolved.harness_id;
    const effectiveWorkDir = work_dir || WORK_DIR;
    const effectiveAgent = agent || resolved.role;

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

    // 4. Write resolved prompt to temp file
    await mkdir(PROMPT_DIR, { recursive: true });
    const promptFile = join(PROMPT_DIR, `${jobId}.md`);
    await writeFile(promptFile, resolved.prompt, "utf-8");

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
      try {
        const result = await executeHarness({
          harness_id: effectiveHarnessId,
          prompt_file: promptFile,
          work_dir: effectiveWorkDir,
          agent: effectiveAgent,
          role: resolved.role,
          timeout_ms,
        });
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = result.exitCode;
      } catch (execError: any) {
        exitCode = execError.exitCode || 1;
        stdout = execError.stdout || "";
        stderr = execError.stderr || execError.message;
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

    // 7. Return result
    res.json({
      job_id: jobId,
      role: resolved.role,
      task: {
        wind_task_id: resolved.task.wind_task_id,
        wind_task_name: resolved.task.wind_task_name,
        task_slug: resolved.task.task_slug,
        scope: resolved.task.scope,
      },
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

// ── Harness execution ───────────────────────────────────────────────

interface HarnessExecParams {
  harness_id: string;
  prompt_file: string;
  work_dir: string;
  agent: string;
  role: string;
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

  // Route to the right executor
  if (binary === "ollama") {
    return executeOllama(promptContent, role, timeout_ms);
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
  timeout_ms: number
): Promise<HarnessExecResult> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "qwen2.5:0.5b";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout_ms);

    const resp = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
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
 */
async function executeOpencode(params: HarnessExecParams): Promise<HarnessExecResult> {
  const { prompt_file, work_dir, agent, role, timeout_ms } = params;

  const cmdArgs = [
    "run",
    "--agent", agent,
    "--dir", work_dir,
    "--format", "json",
    "--file", prompt_file,
    "--dangerously-skip-permissions",
    "",
  ];

  try {
    const { stdout, stderr } = await execFileAsync(
      "opencode",
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

    return { exitCode: 0, stdout, stderr };
  } catch (error: any) {
    return {
      exitCode: error.code || 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
    };
  }
}

// ── Start ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[harness-srv] listening on port ${PORT}`);
  console.log(`[harness-srv] work dir: ${WORK_DIR}`);
  console.log(`[harness-srv] prompt dir: ${PROMPT_DIR}`);
});

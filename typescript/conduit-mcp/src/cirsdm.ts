/**
 * CIR-SDM enforcement bridge (T23 Step 8) — subprocess caller to the Python
 * enforcement CLI (`python -m nexus_core.wrp.enforce_cli`).
 *
 * The pure evaluator lives in Python (`nexus_core/wrp/cir_sdm.py`) and is NOT
 * ported to TypeScript. conduit-mcp shells out to the CLI at WR-transition
 * admission to run the per-family enforcement caller over the WR's ordered
 * event stream plus the proposed transition, then rejects-or-records based on
 * the returned decision.
 *
 * The ONLY environment read on the Python side is `CIR_SDM_ENFORCE` (read by
 * the enforcement caller, never inside the pure evaluate()).
 */

import { spawn } from "node:child_process";
import path from "node:path";

export interface CirsdmViolation {
  violation_id: string;
  rule_id: string;
  rule_version: string;
  severity: string;
  event_id: string;
  cer_id: string | null;
  description: string;
  detected_at: number | null;
  blocking: boolean;
}

export interface CirsdmEnforceResult {
  state: "shadow" | "enforced";
  enforced: boolean;
  rules: string[];
  violations: CirsdmViolation[];
  decisions: CirsdmViolation[];
  reject: boolean;
}

function pythonBin(): string {
  return process.env.CONDUIT_PYTHON || "python3";
}

function pythonPath(): string {
  return (
    process.env.PYTHONPATH ||
    path.resolve(__dirname, "../../../../nexus/python")
  );
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], stdinData?: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin(), ["-m", "nexus_core.wrp.enforce_cli", ...args], {
      env: { ...process.env, PYTHONPATH: pythonPath() },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    if (stdinData !== undefined) {
      proc.stdin.write(stdinData);
    }
    proc.stdin.end();
  });
}

/**
 * Startup audit line — the dispatch service logs this once at boot so the
 * enforcement posture (shadow vs enforced) is auditable (ruling 4a57c089).
 */
export async function getEnforcementState(): Promise<string> {
  const { code, stdout, stderr } = await runCli(["--state-only"]);
  if (code !== 0) {
    throw new Error(`CIR-SDM --state-only failed (${code}): ${stderr.trim()}`);
  }
  return stdout.trim();
}

/**
 * Run the enforcement caller over an ordered event stream plus a proposed
 * transition. Returns the parsed decision (reject + governed decisions).
 */
export async function enforceTransition(
  events: unknown[],
  proposed: unknown,
): Promise<CirsdmEnforceResult> {
  const { code, stdout, stderr } = await runCli(
    [],
    JSON.stringify({ events, proposed }),
  );
  if (code !== 0) {
    throw new Error(`CIR-SDM enforce CLI failed (${code}): ${stderr.trim()}`);
  }
  try {
    return JSON.parse(stdout.trim()) as CirsdmEnforceResult;
  } catch (e: any) {
    throw new Error(
      `CIR-SDM enforce CLI returned invalid JSON: ${stdout.slice(0, 200)}`,
    );
  }
}

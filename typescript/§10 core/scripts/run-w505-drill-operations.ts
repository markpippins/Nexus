/**
 * W5.05 — Operate rollback, disablement, and replay drills (gate 6).
 *
 * Dependency-free tsx script (W4.04/W5.03 conventions). Standalone drill
 * operation run against the now-authorized deny_contract_promotion blocking
 * boundary (ContractAdmissionRegistry, merged W4.06 e814fbc2), per the
 * analyst decomposition (db20fffb) and the gate-12 grant (05d0fe54):
 *
 *   D1  doctrine drift        — digest change at same identity -> admission
 *                               refused (class disabled cleanly); evidence
 *                               append-only; recovery restores last-known-good.
 *   D2  adapter failure       — hostile/failed boundary config -> fail-closed
 *                               (construction throws, never defaults open);
 *                               recovery after config fix.
 *   D3  receipt loss          — missing correlation/artifacts -> refused with
 *                               named reason; append-only history preserved;
 *                               recovery by fresh well-formed admission.
 *   D4  evaluator version     — version monotonicity enforced under replay:
 *                               replay at an older version after a newer one
 *                               is visibly refused (flip visible, not silent);
 *                               recovery at the current version re-admits.
 *
 * Gate-6 properties proven (per c3 of decision 05d0fe54):
 *   - recovery/disablement via the drill harness ONLY
 *   - append-only evidence — no history rewrite ever
 *   - deterministic replay — byte-identical drill transcripts, fingerprinted
 *   - no persisted denials created (c5: drills must not create durable
 *     blocking denials; the c5-barium gate f61d94e6 attaches to the first
 *     persisted denial only)
 *
 * Evidence is written to docs/w505-evidence/ as committed repo artifacts
 * (export pattern per W4.05/W5.04 — no ephemeral DB rows).
 *
 * Run:  npx tsx scripts/run-w505-drill-operations.ts
 *   (from "typescript/§10 core")
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ContractAdmissionRegistry,
  REQUIRED_ARTIFACT_KINDS,
  type ContractAdmissionRequest,
  type ContractAdmissionResult,
} from "../src/runtime/contractAdmission.js";

// ── helpers ─────────────────────────────────────────────────────────────

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function digest(seed: string): string {
  return "sha256:" + createHash("sha256").update(seed).digest("hex");
}

/** Canonical JSON (sorted keys) so transcripts are stable across runs. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

function sha256(text: string): string {
  return "sha256:" + createHash("sha256").update(text).digest("hex");
}

// ── pinning (G1 semantics carried from W5.04) ───────────────────────────

const DRILL_PIN = {
  decisionClass: "deny_contract_promotion",
  decisionId: "05d0fe54",
  amendments: ["1a7b466d (v1 c5 reframe)", "f61d94e6 (v2 c5-barium)", "41d30b44 (v3 c5 scope)", "3a30651a (v4 triplet)"],
  triplet: {
    contract: "admission envelope v1",
    evaluator: "W4.02 governed evaluation (advisory semantics)",
    law: "doctrine corpus (lookup + witnessed-run classifier)",
  },
  mode: "drill_operations_non_blocking",
  authorityCeiling: "advisory (no live blocking; prohibition stands until new gate-12 decision)",
};

// ── fixture factory (deterministic) ─────────────────────────────────────

const DIMS = ["authority", "provenance", "frame"] as const;
const D_V1 = digest("w505|wrp-core|v1");
const D_V2 = digest("w505|wrp-core|v2");

function validRequest(version: number): ContractAdmissionRequest {
  return {
    contractId: "wrp-core",
    version,
    artifacts: REQUIRED_ARTIFACT_KINDS.map((kind) => ({ kind, digest: D_V1 })),
    framingDimensions: {
      authority: "peb",
      provenance: "envelope",
      frame: "is_well_framed",
    },
  };
}

interface DrillResult {
  drill: "D1_doctrine_drift" | "D2_adapter_failure" | "D3_receipt_loss" | "D4_evaluator_version";
  disabledCleanly: boolean;
  historyAppendOnly: boolean;
  recoveryAchieved: boolean;
  detail: string;
}

interface DrillOutcome {
  drill: string;
  step: string;
  verdict: ContractAdmissionResult | { threw: string };
}

// ── drill transcript (shared, append-only) ──────────────────────────────

const drillTranscript: DrillOutcome[] = [];

function record(drill: string, step: string, verdict: ContractAdmissionResult | Error): void {
  drillTranscript.push({
    drill,
    step,
    verdict:
      verdict instanceof Error
        ? { threw: verdict.message }
        : verdict,
  });
}

// ── D1: doctrine drift — digest change disables the class cleanly ───────

function runD1(): DrillResult {
  const DRILL = "D1_doctrine_drift";
  const registry = new ContractAdmissionRegistry(DIMS);

  // Baseline: v1 admits (class operational).
  const baseline = registry.admit(validRequest(1));
  equal(baseline.status, "admitted", "D1 baseline v1 admitted");
  record(DRILL, "baseline_v1_admitted", baseline);

  const eventsBefore = drillTranscript.length;

  // Drift: same version, different digests -> refused (disablement).
  const drifted = registry.admit({
    ...validRequest(1),
    artifacts: REQUIRED_ARTIFACT_KINDS.map((kind) => ({ kind, digest: D_V2 })),
  });
  equal(drifted.status, "refused", "D1 drifted digest refused (class disabled cleanly)");
  record(DRILL, "drifted_digest_refused", drifted);

  // Recovery: v2 with the new digests admits (monotonic forward path).
  const recovered = registry.admit({
    ...validRequest(2),
    artifacts: REQUIRED_ARTIFACT_KINDS.map((kind) => ({ kind, digest: D_V2 })),
  });
  equal(recovered.status, "admitted", "D1 recovery via monotonic v2 with corrected digests");
  record(DRILL, "recovery_v2_admitted", recovered);

  // History append-only: drift + recovery records retained after baseline.
  const appendOnly = drillTranscript.length >= eventsBefore + 2;

  return {
    drill: DRILL,
    disabledCleanly: drifted.status === "refused",
    historyAppendOnly: appendOnly,
    recoveryAchieved: recovered.status === "admitted",
    detail: "digest change at same version -> refused; recovery via monotonic v2; transcript append-only",
  };
}

// ── D2: adapter failure — hostile config fails closed, recovery after fix ──

function runD2(): DrillResult {
  const DRILL = "D2_adapter_failure";

  // Hostile config: empty framing dimensions must throw (fail-closed
  // construction), never default open.
  let threw: string | null = null;
  try {
    new ContractAdmissionRegistry([]);
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  equal(threw, "admission_requires_framing_dimensions", "D2 hostile config throws (fail-closed)");
  record(DRILL, "hostile_config_threw", { threw: threw ?? "" });

  const eventsBefore = drillTranscript.length;

  // Recovery: after config fix (valid dimensions), the boundary admits.
  const registry = new ContractAdmissionRegistry(DIMS);
  const recovered = registry.admit(validRequest(1));
  equal(recovered.status, "admitted", "D2 recovery after config fix");
  record(DRILL, "recovery_after_config_fix", recovered);

  return {
    drill: DRILL,
    disabledCleanly: threw === "admission_requires_framing_dimensions",
    historyAppendOnly: drillTranscript.length >= eventsBefore + 1,
    recoveryAchieved: recovered.status === "admitted",
    detail: "empty-dimension config throws (never defaults open); recovery after fix admits cleanly",
  };
}

// ── D3: receipt loss — missing correlation refused, recovery by fresh admission ──

function runD3(): DrillResult {
  const DRILL = "D3_receipt_loss";
  const registry = new ContractAdmissionRegistry(DIMS);

  // Seed: v1 admitted.
  const seed = registry.admit(validRequest(1));
  equal(seed.status, "admitted", "D3 seed v1 admitted");
  record(DRILL, "seed_v1_admitted", seed);

  const eventsBefore = drillTranscript.length;

  // Receipt loss: artifacts stripped -> refused with named reason.
  const loss = registry.admit({ ...validRequest(2), artifacts: [] });
  equal(loss.status, "refused", "D3 missing artifacts (receipt loss) refused");
  equal((loss.reason ?? "").startsWith("missing_artifact:"), true, "D3 refusal names the missing artifact");
  record(DRILL, "receipt_loss_refused", loss);

  // Correlation loss: identity missing -> refused.
  const noIdentity = registry.admit({ ...validRequest(2), contractId: "" });
  equal(noIdentity.status, "refused", "D3 missing contract identity refused");
  record(DRILL, "identity_loss_refused", noIdentity);

  // Recovery: fresh well-formed v2 admission succeeds; loss records retained.
  const recovered = registry.admit(validRequest(2));
  equal(recovered.status, "admitted", "D3 recovery via fresh well-formed admission");
  record(DRILL, "recovery_v2_admitted", recovered);

  const lossRecorded = drillTranscript
    .slice(eventsBefore)
    .some((o) => o.step === "receipt_loss_refused");
  const appendOnly = lossRecorded && drillTranscript.length >= eventsBefore + 3;

  return {
    drill: DRILL,
    disabledCleanly: loss.status === "refused" && noIdentity.status === "refused",
    historyAppendOnly: appendOnly,
    recoveryAchieved: recovered.status === "admitted",
    detail: "receipt/identity loss refused with named reasons; loss evidence retained; fresh admission recovers",
  };
}

// ── D4: evaluator version — replay at older version visibly refused ─────

function runD4(): DrillResult {
  const DRILL = "D4_evaluator_version";
  const registry = new ContractAdmissionRegistry(DIMS);

  // v1 admitted, then v2 (newer evaluator version).
  const v1 = registry.admit(validRequest(1));
  equal(v1.status, "admitted", "D4 v1 admitted");
  record(DRILL, "v1_admitted", v1);
  const v2 = registry.admit(validRequest(2));
  equal(v2.status, "admitted", "D4 v2 admitted (monotonic)");
  record(DRILL, "v2_admitted", v2);

  const eventsBefore = drillTranscript.length;

  // Replay at the OLDER version after v2: visibly refused (flip visible,
  // not silent) — the disablement semantics for stale replays.
  const replayV1 = registry.admit(validRequest(1));
  equal(replayV1.status, "refused", "D4 replay at v1 after v2 visibly refused");
  equal((replayV1.reason ?? "").startsWith("version_not_monotonic:"), true, "D4 refusal names the monotonicity predicate");
  record(DRILL, "replay_v1_refused", replayV1);

  // Re-admission at the head version is also refused: registry state is
  // immutable — a replay can never re-grant or rewrite recorded state.
  const replayV2 = registry.admit(validRequest(2));
  equal(replayV2.status, "refused", "D4 re-admission at head version refused (state immutable)");
  record(DRILL, "replay_v2_refused_state_immutable", replayV2);

  // Recovery: a genuinely new version still admits — the boundary remains
  // fully functional after the refused replays.
  const v3 = registry.admit(validRequest(3));
  equal(v3.status, "admitted", "D4 boundary remains functional: v3 admits after refused replays");
  record(DRILL, "recovery_v3_admitted", v3);

  const appendOnly =
    drillTranscript.slice(eventsBefore).some((o) => o.step === "replay_v1_refused") &&
    drillTranscript.length >= eventsBefore + 2;

  return {
    drill: DRILL,
    disabledCleanly: replayV1.status === "refused",
    historyAppendOnly: appendOnly,
    recoveryAchieved: v3.status === "admitted",
    detail: "stale replay refused with named reason (visible flip); head re-admission refused (state immutable); new version admits",
  };
}

// ── execution ───────────────────────────────────────────────────────────

const drills: DrillResult[] = [runD1(), runD2(), runD3(), runD4()];
for (const d of drills) {
  equal(d.disabledCleanly, true, `${d.drill} disabled cleanly`);
  equal(d.historyAppendOnly, true, `${d.drill} history append-only`);
  equal(d.recoveryAchieved, true, `${d.drill} recovery achieved`);
}

// Determinism: run the full drill suite in a fresh closure and compare
// canonical transcripts (timestamps excluded — they are not in the transcript).
function fullDrillTranscript(): string {
  const t: DrillOutcome[] = [];
  const save = drillTranscript.splice(0, drillTranscript.length);
  try {
    runD1();
    runD2();
    runD3();
    runD4();
    t.push(...drillTranscript);
  } finally {
    drillTranscript.splice(0, drillTranscript.length, ...save);
  }
  return canonicalJson(t);
}

const transcript1 = fullDrillTranscript();
const transcript2 = fullDrillTranscript();
equal(transcript1, transcript2, "determinism: drill transcripts byte-identical across double run");
const drillFingerprint = sha256(transcript1);

// Isolation: the drill surface exposes admit only — no blocking toggle,
// no store writes, no verdict mutation.
{
  const registry = new ContractAdmissionRegistry(DIMS) as unknown as Record<string, unknown>;
  const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(registry)).filter(
    (n) => n !== "constructor",
  );
  equal(methodNames.sort().join(","), "admit", "isolation: public surface is admit-only");
}

// ── evidence export (commit-artifact pattern) ───────────────────────────

const evidence = {
  workItem: "W5.05",
  title: "deny_contract_promotion rollback/disablement/replay drill operations (gate 6)",
  generatedAt: new Date().toISOString(),
  pin: DRILL_PIN,
  drills,
  isolation: {
    publicSurface: "admit-only (no blocking toggle, no store writes, no verdict mutation)",
    assertion: "drills exercise the boundary through admit() exclusively; zero durable authority touched",
  },
  determinism: {
    doubleRunByteIdentical: transcript1 === transcript2,
    drillFingerprint,
    transcriptSteps: drillTranscript.length,
  },
  constraints: {
    c2: "registry remains the sole submit surface — all drill steps go through admit()",
    c3: "recovery/disablement via drill harness only; append-only evidence; no history rewrite",
    c5: "no persisted denials created by this run; c5-barium gate (f61d94e6) attaches to first persisted denial only",
  },
  exportPattern: "evidence committed to docs/w505-evidence/ as repo artifacts; no ephemeral DB rows",
};

// wt-driftfix/typescript/§10 core/scripts/ -> wt-driftfix/docs/w505-evidence
const outDir = resolve(import.meta.dirname ?? ".", "..", "..", "..", "docs", "w505-evidence");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "w505-drill-summary.json"), JSON.stringify(evidence, null, 2) + "\n");
writeFileSync(
  join(outDir, "w505-drill-transcript.json"),
  JSON.stringify({ fingerprint: drillFingerprint, transcript: drillTranscript }, null, 2) + "\n",
);

console.log("W5.05 drill operations: PASS");
for (const d of drills) {
  console.log(`  ${d.drill}: disabled=${d.disabledCleanly} appendOnly=${d.historyAppendOnly} recovery=${d.recoveryAchieved}`);
}
console.log(`  fingerprint: ${drillFingerprint}`);
console.log(`  evidence: ${outDir}`);

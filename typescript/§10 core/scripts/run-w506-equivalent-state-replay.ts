/**
 * W5.06 — Equivalent-state replay (stateful evaluator vs. W4.05 shadow).
 *
 * Dependency-free tsx script (W4.04 drill conventions). Replays the exact
 * W4.05 shadow sample through ONE stateful ContractAdmissionRegistry across
 * all 1,344 records, then pairs shadow and replay rows by (case_class,
 * ordinal-within-class) at seed 42 — the two id schemes differ, so the join
 * is positional within each case class (see the W5.04 transcript pairing
 * note).
 *
 * Why: the W5.06 parity comparison juxtaposes a STATELESS shadow evaluator
 * (W4.05: peb_status per row) against a STATEFUL live evaluator
 * (ContractAdmissionRegistry with version monotonicity + digest
 * immutability). Mismatch counts therefore conflate genuine semantic
 * divergence with evaluator-state asymmetry. This harness applies the
 * architect-approved corrective (spec 91dadca9, supersedes a27948a2):
 *
 *   PRIMARY   formal normalization/classification rule over (shadow
 *             inputs, registry state machine) partitioning all mismatches
 *             into {expected-stateful-refusal, semantic-divergence, open}.
 *             See docs/w506-evidence/w506-normalization-rule.md.
 *   SECONDARY this replay harness — row-level evidence of the derivation.
 *
 * Evidence lineage: the shadow side is READ from the committed
 * python/peb-kernel/evidence/w405/w405_shadow_evidence.json — never
 * regenerated. The canary side is re-derived from buildSample() (seed 42)
 * replayed through ONE stateful registry, cross-checkable against the
 * committed W5.04 pass-1 transcript.
 *
 * Row schema: {shadowRequestId, canaryRequestId, caseClass, ordinal,
 * shadowPebStatus, shadowAdapterStatus, shadowVerdict, shadowDisposition,
 * canaryStatus, canaryReason, freshStatus, freshReason, classification}.
 *
 * classification is "open" on EVERY row: the engineer derives the rule and
 * records the per-row derivation inputs (freshStatus/freshReason: the same
 * request admitted against a FRESH empty registry), but does not classify
 * rows. The analyst applies/validates the rule per I2.
 *
 * Acceptance oracle (91dadca9): the stateful replay reproduces
 *   1,035 mismatches = 767 clean + 268 duplicate_retry,
 * where a mismatch is a row the stateless shadow expected to resolve
 * (peb_status "resolved") but the stateful registry refused.
 *
 * Run:  npx tsx scripts/run-w506-equivalent-state-replay.ts   (from "typescript/§10 core")
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ContractAdmissionRegistry,
  REQUIRED_ARTIFACT_KINDS,
  type ContractAdmissionRequest,
  type ContractAdmissionResult,
} from "../src/runtime/contractAdmission.js";

// ── helpers (same conventions as W5.04 canary) ──────────────────────────

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function digest(seed: string): string {
  return "sha256:" + createHash("sha256").update(seed).digest("hex");
}

function sha256(text: string): string {
  return "sha256:" + createHash("sha256").update(text).digest("hex");
}

/** Canonical JSON (sorted keys) — stable transcripts across runs. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

/** Deterministic LCG PRNG (seeded, reproducible across processes). */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

// ── W5.06 pin ───────────────────────────────────────────────────────────

const W506_PIN = {
  decisionClass: "deny_contract_promotion",
  decisionId: "05d0fe54",
  spec: "91dadca9 (W5.06 corrective REVISED; supersedes a27948a2)",
  hotPing: "236ecfcf",
  workItem: "W5.06",
  mode: "equivalent_state_replay_simulation_non_blocking",
  authorityCeiling: "advisory (no live blocking; prohibition stands until new gate-12 decision)",
  freeze: "contractAdmission.ts frozen pending W5.09 — replay only, no semantic change",
} as const;

// ── committed evidence inputs (read-only; lineage preserved) ────────────

const worktreeRoot = resolve(import.meta.dirname ?? ".", "..", "..", "..");
const shadowPath = join(
  worktreeRoot,
  "python",
  "peb-kernel",
  "evidence",
  "w405",
  "w405_shadow_evidence.json",
);

interface ShadowRecord {
  request_id: string;
  case_class: CaseClass;
  peb_status: string;
  adapter_status: string;
  verdict: "match" | "divergent";
  disposition: "agreement" | "explained_divergence";
}

function loadShadowRecords(): ShadowRecord[] {
  const raw = JSON.parse(readFileSync(shadowPath, "utf8")) as {
    records?: Array<Record<string, unknown>>;
  };
  const records = raw.records ?? [];
  equal(records.length, SAMPLE_TOTAL, "committed shadow evidence record count");
  return records.map((r, i) => {
    const rec = r as unknown as ShadowRecord;
    equal(typeof rec.request_id, "string", `shadow record ${i} request_id`);
    equal(
      SAMPLE_PLAN.some((p) => p.caseClass === rec.case_class),
      true,
      `shadow record ${i} case_class known`,
    );
    return rec;
  });
}

/**
 * Pairs shadow records with replay outcomes by (case_class,
 * ordinal-within-class). Shadow ordinals follow the committed file order
 * within each class; replay ordinals follow buildSample() order. Both
 * derive from the same seeded plan, so ordinal k within a class is the
 * same underlying sample record on both sides.
 */
function pairByClassOrdinal(
  shadow: ShadowRecord[],
  outcomes: ReplayOutcome[],
): Array<{ shadow: ShadowRecord; outcome: ReplayOutcome }> {
  const shadowByOrdinal = new Map<string, ShadowRecord>();
  const seen = new Map<CaseClass, number>();
  for (const rec of shadow) {
    const ordinal = seen.get(rec.case_class) ?? 0;
    seen.set(rec.case_class, ordinal + 1);
    shadowByOrdinal.set(`${rec.case_class}#${ordinal}`, rec);
  }
  const paired: Array<{ shadow: ShadowRecord; outcome: ReplayOutcome }> = [];
  for (const o of outcomes) {
    const shadow = shadowByOrdinal.get(`${o.caseClass}#${o.ordinal}`);
    equal(shadow !== undefined, true, `shadow pair for ${o.caseClass}#${o.ordinal}`);
    paired.push({ shadow: shadow!, outcome: o });
  }
  return paired;
}

// ── canary-side sample reconstruction (verbatim W5.04 buildSample) ──────

const SAMPLE_PLAN: Array<{ caseClass: CaseClass; n: number }> = [
  { caseClass: "clean", n: 768 },
  { caseClass: "refusal", n: 96 },
  { caseClass: "unknown", n: 96 },
  { caseClass: "duplicate_retry", n: 288 },
  { caseClass: "stale", n: 48 },
  { caseClass: "drift", n: 48 },
];
const SAMPLE_TOTAL = SAMPLE_PLAN.reduce((sum, p) => sum + p.n, 0);

interface CanaryRecord {
  requestId: string;
  caseClass: CaseClass;
  ordinal: number;
  admissionRequest: ContractAdmissionRequest;
}

/**
 * Verbatim port of buildSample() from run-w504-bounded-canary.ts (seed 42):
 * same LCG stream, same per-class request shaping, same order.
 */
function buildSample(): CanaryRecord[] {
  const rand = lcg(42); // W4.05 seed convention
  const records: CanaryRecord[] = [];
  for (const { caseClass, n } of SAMPLE_PLAN) {
    for (let i = 0; i < n; i++) {
      const requestId = `canary-42-${caseClass}-${String(i).padStart(4, "0")}`;
      const version = 1 + (Math.floor(rand() * 3) === 0 ? 1 : 0); // mostly v1, some v2
      const base: ContractAdmissionRequest = {
        contractId: "wrp-core",
        version,
        artifacts: REQUIRED_ARTIFACT_KINDS.map((kind) => ({
          kind,
          digest: digest(`w504|${requestId}|v${version}`),
        })),
        framingDimensions: { authority: "peb", provenance: "envelope", frame: "is_well_framed" },
      };
      let request = base;
      switch (caseClass) {
        case "refusal":
          request = { ...base, framingDimensions: { ...base.framingDimensions, frame: "" } };
          break;
        case "unknown":
          request = { ...base, artifacts: [{ kind: "typespec", digest: "sha256:short" }, { kind: "jsonld", digest: base.artifacts[1]!.digest }, { kind: "cue", digest: base.artifacts[2]!.digest }] };
          break;
        case "duplicate_retry":
          // Same requestId family as an earlier record (i mod 12) — retry shape.
          request = { ...base, contractId: `wrp-core-retry-${i % 12}` };
          break;
        case "stale":
          // Superseded version re-submitted (stale artifact set).
          request = { ...base, version: 1 };
          break;
        case "drift":
          // Digest changed for the same identity at the same version.
          request = { ...base, artifacts: REQUIRED_ARTIFACT_KINDS.map((kind) => ({ kind, digest: digest(`w504|${requestId}|DRIFT`) })) };
          break;
        default:
          break;
      }
      records.push({ requestId, caseClass, ordinal: i, admissionRequest: request });
    }
  }
  return records;
}

// ── stateful replay: ONE registry across ALL records ────────────────────

interface ReplayOutcome {
  requestId: string;
  caseClass: CaseClass;
  ordinal: number;
  admission: ContractAdmissionResult;
  recordFingerprint: string;
}

function runStatefulReplay(records: CanaryRecord[]): ReplayOutcome[] {
  // The defining difference from a stateless evaluator: a SINGLE registry
  // for the whole pass. Version monotonicity and digest immutability
  // persist across records, exactly like the live evaluator.
  const registry = new ContractAdmissionRegistry(["authority", "provenance", "frame"]);
  const outcomes: ReplayOutcome[] = [];
  for (const record of records) {
    const admission = registry.admit(record.admissionRequest);
    outcomes.push({
      requestId: record.requestId,
      caseClass: record.caseClass,
      ordinal: record.ordinal,
      admission,
      recordFingerprint: sha256(canonicalJson({ id: record.requestId, admission })),
    });
  }
  return outcomes;
}

/**
 * Derivation input D(row): the same request admitted against a FRESH empty
 * registry. If the fresh replay admits, the stateful refusal was caused
 * solely by registry state accumulated from earlier rows. If it refuses
 * with the same reason, the refusal is state-independent.
 */
function freshDerivation(request: ContractAdmissionRequest): ContractAdmissionResult {
  return new ContractAdmissionRegistry(["authority", "provenance", "frame"]).admit(request);
}

// ── execution ───────────────────────────────────────────────────────────

const shadowRecords = loadShadowRecords();
const sample = buildSample();
const pass1 = runStatefulReplay(sample);
const pass2 = runStatefulReplay(sample); // double-run determinism

const transcript1 = canonicalJson(pass1.map(({ recordFingerprint, ...rest }) => ({ ...rest, fp: recordFingerprint })));
const transcript2 = canonicalJson(pass2.map(({ recordFingerprint, ...rest }) => ({ ...rest, fp: recordFingerprint })));
equal(transcript1, transcript2, "double-run transcripts byte-identical");
const replayFingerprint = sha256(transcript1);

const paired = pairByClassOrdinal(shadowRecords, pass1);
equal(paired.length, SAMPLE_TOTAL, "one paired row per record");

// Outcome distribution: the stateful evaluator's verdicts per class.
const outcomeCounts = new Map<CaseClass, { admitted: number; refused: number }>();
for (const o of pass1) {
  const bucket = outcomeCounts.get(o.caseClass) ?? { admitted: 0, refused: 0 };
  if (o.admission.status === "admitted") bucket.admitted += 1;
  else bucket.refused += 1;
  outcomeCounts.set(o.caseClass, bucket);
}

const rows = paired.map(({ shadow, outcome }) => {
  const fresh = freshDerivation(
    sample.find((s) => s.requestId === outcome.requestId)!.admissionRequest,
  );
  return {
    shadowRequestId: shadow.request_id,
    canaryRequestId: outcome.requestId,
    caseClass: outcome.caseClass,
    ordinal: outcome.ordinal,
    shadowPebStatus: shadow.peb_status,
    shadowAdapterStatus: shadow.adapter_status,
    shadowVerdict: shadow.verdict,
    shadowDisposition: shadow.disposition,
    canaryStatus: outcome.admission.status,
    canaryReason: outcome.admission.reason ?? null,
    freshStatus: fresh.status,
    freshReason: fresh.reason ?? null,
    classification: "open" as const,
  };
});

// ── acceptance oracle ───────────────────────────────────────────────────

// A mismatch is a row the STATELESS shadow expected to resolve
// (peb_status "resolved") that the STATEFUL registry refused.
const mismatch = rows.filter((r) => r.shadowPebStatus === "resolved" && r.canaryStatus === "refused");
const mismatchByClass = new Map<CaseClass, number>();
for (const r of mismatch) {
  mismatchByClass.set(r.caseClass, (mismatchByClass.get(r.caseClass) ?? 0) + 1);
}

// Acceptance oracle (91dadca9): 1,035 = 767 clean + 268 duplicate_retry.
equal(mismatch.length, 1035, "oracle: total mismatches");
equal(mismatchByClass.get("clean") ?? 0, 767, "oracle: clean mismatches");
equal(mismatchByClass.get("duplicate_retry") ?? 0, 268, "oracle: duplicate_retry mismatches");

// Derivation inputs for the analyst (engineer does NOT classify):
// every mismatched row carries freshStatus/freshReason — the same request
// replayed against a fresh empty registry.
const derivationCounts = new Map<string, number>();
for (const r of mismatch) {
  const key = `fresh=${r.freshStatus};stateful=${(r.canaryReason ?? "").split(":")[0]}`;
  derivationCounts.set(key, (derivationCounts.get(key) ?? 0) + 1);
}

const agreed = rows.length - mismatch.length;

// ── export ──────────────────────────────────────────────────────────────

const summary = {
  workItem: "W5.06",
  title: "W5.06 equivalent-state replay: stateful evaluator vs. W4.05 shadow",
  generatedAt: new Date().toISOString(),
  pin: W506_PIN,
  inputs: {
    shadow: "python/peb-kernel/evidence/w405/w405_shadow_evidence.json (committed; read-only)",
    canaryDerivation: "buildSample() from run-w504-bounded-canary.ts (seed 42), verbatim",
    crossCheck: "docs/w504-evidence/w504-canary-transcript-full.json (committed pass-1 transcript)",
  },
  sample: { seed: 42, total: SAMPLE_TOTAL, plan: SAMPLE_PLAN },
  outcomes: Object.fromEntries(outcomeCounts),
  parity: {
    totals: { rows: rows.length, agreed, mismatch: mismatch.length },
    mismatchByClass: Object.fromEntries(mismatchByClass),
    mismatchDefinition: "shadowPebStatus === 'resolved' && canaryStatus === 'refused'",
    oracle: {
      expression: "1035 = 767 clean + 268 duplicate_retry",
      verified: mismatch.length === 1035 && (mismatchByClass.get("clean") ?? 0) === 767 && (mismatchByClass.get("duplicate_retry") ?? 0) === 268,
    },
  },
  derivation: {
    rule: "docs/w506-evidence/w506-normalization-rule.md",
    perRowInputs: "freshStatus/freshReason — the row's request admitted against a fresh empty registry",
    observed: Object.fromEntries(derivationCounts),
    classificationNote: "classification stays 'open' on every row; the analyst applies the rule (I2)",
  },
  determinism: {
    doubleRunByteIdentical: transcript1 === transcript2,
    replayFingerprint,
    perRecordFingerprints: pass1.length,
  },
  pairingKey: "(case_class, ordinal-within-class) at seed 42 — id schemes differ from the W4.05 shadow export, do not join by id",
  rowCount: rows.length,
  rows,
};

const outDir = join(worktreeRoot, "docs", "w506-evidence");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "w506-equivalent-state-replay.json"), JSON.stringify(summary, null, 2) + "\n");

console.log("W5.06 equivalent-state replay: PASS");
console.log(`  sample n=${SAMPLE_TOTAL} (seed 42)`);
console.log(`  outcomes: ${JSON.stringify(Object.fromEntries(outcomeCounts))}`);
console.log(`  parity: agreed=${agreed} mismatch=${mismatch.length} (oracle 1035 = 767 clean + 268 duplicate_retry)`);
console.log(`  derivation inputs: ${JSON.stringify(Object.fromEntries(derivationCounts))}`);
console.log(`  double-run byte-identical: ${transcript1 === transcript2}`);
console.log(`  fingerprint: ${replayFingerprint}`);
console.log(`  evidence: ${outDir}`);

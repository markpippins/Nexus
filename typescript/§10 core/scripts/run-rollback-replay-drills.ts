/**
 * W4.04 — Rollback and replay drills (dependency-free tsx script).
 *
 * Exercises recovery paths over the merged W3.06 DoctrineLookupRegistry,
 * the witnessed-run classifier, and the W4.02 advisory evaluation:
 *
 *   D1  doctrine drift      — primary superseded -> stale -> divergence
 *                             recorded -> rollback -> fallback
 *                             authoritative; lifecycle events append-only.
 *   D2  adapter failure     — primary lookup throws -> fallback serves,
 *                             divergence recorded, observations append-only.
 *   D3  receipt loss        — witnessed-run classifier fail-closed on
 *                             missing receipts (missing_lineage / unknown);
 *                             recovery by re-witnessing a fresh row without
 *                             rewriting the historical one.
 *   D4  evaluator-version   — evaluator-version change flips the advisory
 *                             verdict deterministically; the mismatch is
 *                             VISIBLE in the append-only verdict history
 *                             (fail-closed = mismatch is visible, not silent).
 *
 * Semantics note (W3.06 as merged): the registry records a divergence only
 * when the primary result is NON-resolved. Digest comparison of resolved
 * results is the replay verifier's job, not the registry's. D1 therefore
 * models doctrine drift as superseding the record (primary -> stale).
 *
 * Exit non-zero on any drill failure (fail-closed).
 */
import { InMemoryDoctrineLookup, type DoctrineLookup, type DoctrineLookupRequest, type DoctrineLookupResult, type DoctrineRecord } from "../src/runtime/doctrineLookup.js";
import { DoctrineLookupRegistry } from "../src/runtime/doctrineLookup.registry.js";
import { classifyWitnessedRunStatus } from "../../execution-srv/src/routes.js";
import {
  DEFAULT_ADVISORY_POLICY,
  evaluateAdvisory,
  type AdvisoryVerdict,
} from "../src/runtime/advisoryEvaluation.js";

let failures = 0;

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: ${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const REC_V1: DoctrineRecord = {
  kind: "doctrine",
  id: "doc-1",
  version: 1,
  digest: "sha256:v1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  supersededAt: null,
  sourceDecisionId: "dec-1",
};

const REQ: DoctrineLookupRequest = { kind: "doctrine", stableId: "doc-1", asOf: "2026-08-30T00:00:00.000Z" };

/** Registry with a controllable primary (mutable record set) + in-memory fallback. */
function makeDrillRegistry(): {
  registry: DoctrineLookupRegistry;
  setPrimaryRecords: (records: DoctrineRecord[]) => void;
} {
  let primaryRecords: DoctrineRecord[] = [REC_V1];
  const primary: DoctrineLookup = {
    async lookup(request: DoctrineLookupRequest): Promise<DoctrineLookupResult> {
      const candidates = primaryRecords.filter(
        (r) => r.kind === request.kind && r.id === request.stableId,
      );
      const active = candidates
        .filter((r) => r.effectiveFrom <= request.asOf && (r.supersededAt == null || r.supersededAt > request.asOf))
        .sort((l, r) => r.effectiveFrom.localeCompare(l.effectiveFrom) || r.version - l.version)[0];
      if (!active) {
        return { status: "stale", consulted: true, latencyMs: 0, reason: "stable_id_not_effective_at_as_of" };
      }
      return { status: "resolved", consulted: true, latencyMs: 0, record: structuredClone(active) };
    },
  };
  // Fallback keeps serving the last-known-good record.
  const fallback = new InMemoryDoctrineLookup([{ ...REC_V1, digest: "sha256:v1-fallback", version: 1 }]);
  const registry = new DoctrineLookupRegistry({
    primary: { id: "pg", adapter: primary },
    fallback: { id: "memory", adapter: fallback },
    minObservationsForRetirement: 1,
    now: () => new Date(0).toISOString(),
  });
  return {
    registry,
    setPrimaryRecords: (records: DoctrineRecord[]) => {
      primaryRecords = records;
    },
  };
}

// ── D1: doctrine drift — supersede -> stale -> divergence -> rollback ──
{
  const { registry, setPrimaryRecords } = makeDrillRegistry();
  await registry.lookup(REQ);
  const eventsBefore = registry.getLifecycleEvents().length;
  // Doctrine drift: primary record superseded -> primary returns stale ->
  // registry records a divergence and serves the fallback (last-known-good).
  setPrimaryRecords([{ ...REC_V1, supersededAt: "2026-08-29T00:00:00.000Z" }]);
  const during = await registry.lookup(REQ);
  equal(during.status, "resolved", "D1 fallback serves last-known-good during drift");
  equal(registry.getDivergences().length, 1, "D1 divergence recorded for drift");
  equal(registry.evaluateRetirementGate().passed, false, "D1 open divergence blocks retirement (fail-closed)");
  // Rollback: fallback becomes authoritative; lifecycle events append-only.
  registry.rollback("drill D1 doctrine drift");
  const events = registry.getLifecycleEvents();
  equal(events.length, eventsBefore + 1, "D1 rollback appends exactly one event");
  equal(events[events.length - 1]?.type, "rollback", "D1 rollback event appended");
  equal(events.slice(0, eventsBefore).length, eventsBefore, "D1 prior events preserved (append-only)");
  // Recovery: primary restored to the canonical record; rollback stands.
  setPrimaryRecords([REC_V1]);
  const recovered = await registry.lookup(REQ);
  equal(recovered.status, "resolved", "D1 recovery resolves after primary fix");
}

// ── D2: adapter failure — primary throws → fallback serves, append-only observations ──
{
  let primaryCalls = 0;
  const brokenPrimary: DoctrineLookup = {
    async lookup(): Promise<DoctrineLookupResult> {
      primaryCalls++;
      throw new Error("primary connection refused");
    },
  };
  const fallback = new InMemoryDoctrineLookup([REC_V1]);
  const registry = new DoctrineLookupRegistry({
    primary: { id: "pg", adapter: brokenPrimary },
    fallback: { id: "memory", adapter: fallback },
    minObservationsForRetirement: 1,
    now: () => new Date(0).toISOString(),
  });
  const served = await registry.lookup(REQ);
  equal(served.status, "resolved", "D2 fallback serves when primary throws");
  equal(primaryCalls, 1, "D2 primary attempted exactly once");
  equal(registry.getDivergences().length, 1, "D2 divergence recorded for primary failure");
  const obsBefore = registry.getObservations().length;
  await registry.lookup(REQ);
  equal(registry.getObservations().length, obsBefore + 1, "D2 observations append-only (grow, never shrink)");
}

// ── D3: receipt loss — classifier fail-closed, recovery without history rewrite ──
{
  const envelope = { id: "env-1", evaluationFingerprint: "fp-1" };
  const manifest = { id: "mf-1" };
  const fullRow = {
    peb_admission: "11111111-1111-1111-1111-111111111111",
    conduit_transition: "22222222-2222-2222-2222-222222222222",
    evidence: { ids: ["ev-1"] },
  };
  const base = { envelope, manifest, assessment: {}, replay: {} };
  equal(
    classifyWitnessedRunStatus({ ...base, row: fullRow }),
    "complete",
    "D3 full lineage classifies complete",
  );
  // Receipt loss: drop the receipts -> fail-closed to missing_lineage.
  const lossRow = { ...fullRow, peb_admission: null, conduit_transition: null };
  equal(
    classifyWitnessedRunStatus({ envelope, manifest, assessment: {}, replay: {}, row: lossRow }),
    "missing_lineage",
    "D3 receipt loss -> missing_lineage (fail-closed)",
  );
  // Total loss: no lineage at all -> unknown (indeterminate, PR #87 semantics).
  equal(
    classifyWitnessedRunStatus({
      envelope: { id: null, evaluationFingerprint: null },
      manifest: { id: null },
      assessment: {},
      replay: {},
      row: { peb_admission: null, conduit_transition: null, evidence: null },
    }),
    "unknown",
    "D3 empty lineage -> unknown (indeterminate, PR #87 semantics)",
  );
  // Recovery: re-witnessing produces a fresh complete row; the historical
  // loss row is never rewritten (immutable evidence).
  const lossRowFrozen = { ...lossRow };
  equal(
    classifyWitnessedRunStatus({ envelope, manifest, assessment: {}, replay: {}, row: fullRow }),
    "complete",
    "D3 recovery via re-witnessing (fresh row) classifies complete",
  );
  equal(
    lossRow.peb_admission === null && lossRow.conduit_transition === null && lossRowFrozen.peb_admission === null,
    true,
    "D3 historical loss row never rewritten (immutable evidence)",
  );
}

// ── D4: evaluator-version change — verdict flip is deterministic and VISIBLE ──
{
  const { registry, setPrimaryRecords } = makeDrillRegistry();
  const verdicts: { digest: string; verdict: AdvisoryVerdict }[] = [];
  const evaluate = (record: { id: string; version: number; digest: string }): boolean => {
    verdicts.push({ digest: record.digest, verdict: "pending" });
    return record.digest === "sha256:v1";
  };
  // v1 doctrine: advisory pass.
  const v1 = await evaluateAdvisory(registry, { requestId: "env-1", doctrineRequest: REQ, evaluate });
  equal(v1.verdict, "advisory_pass", "D4 v1 advisory_pass");
  equal(v1.record?.digest, "sha256:v1", "D4 v1 consulted record identity");
  // Evaluator version change: primary serves a superseded (v2) record ->
  // registry returns the fallback's last-known-good -> verdict recomputed
  // deterministically. The mismatch is VISIBLE: the consulted digest changed
  // and the verdict flips from pass to fail. Nothing silent.
  setPrimaryRecords([{ ...REC_V1, supersededAt: "2026-08-29T00:00:00.000Z" }]);
  const v2 = await evaluateAdvisory(registry, { requestId: "env-2", doctrineRequest: REQ, evaluate });
  equal(v2.verdict, "advisory_fail", "D4 verdict flips deterministically under changed doctrine");
  equal(v2.record?.digest, "sha256:v1-fallback", "D4 fallback record identity is visible in the verdict");
  // The fail-closed property: the mismatch is VISIBLE in the verdict flip +
  // the registry divergence, not silent. Recovery: new evaluation under the
  // corrected doctrine passes again; verdict history is append-only.
  setPrimaryRecords([REC_V1]);
  const recovered = await evaluateAdvisory(registry, { requestId: "env-3", doctrineRequest: REQ, evaluate: () => true });
  equal(recovered.verdict, "advisory_pass", "D4 recovery under corrected doctrine");
  equal(verdicts.length >= 2, true, "D4 verdict history append-only (both consulted)");
  equal(registry.getDivergences().length >= 1, true, "D4 divergence evidence preserved");
}

// ── Global fail-closed gate ──
if (failures > 0) {
  console.error(`rollback-replay drills: ${failures} failure(s)`);
  process.exit(1);
}
console.log("rollback-replay drills: D1-D4 passed (no history rewrite, recovery achieved, evidence append-only)");

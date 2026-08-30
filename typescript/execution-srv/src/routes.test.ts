/**
 * W2.06 witnessed-runs conformance test — execution-srv.
 *
 * Dependency-free, `tsx`-driven (same convention as the §10 core
 * `scripts/run-*-conformance.ts`). Drives the exported `witnessedRunHandler`
 * with a mocked pg `Pool` + a minimal Express req/res shim, covering:
 *
 *   AC1  complete join  — full lineage yields HTTP 200 + `complete`
 *   AC2  explicit state classification — all 7-state vocabulary cases
 *   AC3  PEB admission and Conduit transition receipt references stay
 *        separate (distinct ids; no fabricated/shared receipt identity)
 *   AC5  partial / missing lineage, drift, refusal, duplicate-retry
 *
 * Run:  tsx src/routes.test.ts   (from execution-srv)
 */
import { Pool } from 'pg';
import { witnessedRunHandler, classifyWitnessedRunStatus } from './routes.js';
import type { WitnessedRunStatus } from './routes.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('W2.06 conformance FAIL: ' + msg);
}

/** Minimal pg.Pool stand-in returning a fixed row set for every query. */
class MockPool {
  constructor(private readonly rows: unknown[]) {}
  get query() {
    return async () => ({ rows: this.rows, rowCount: this.rows.length });
  }
}

interface CallResult {
  status: number;
  body: any;
}

/** Invoke the handler with a mock req/res and capture status + body. */
function callHandler(
  handler: (req: any, res: any) => Promise<any>,
  query: Record<string, string>,
): Promise<CallResult> {
  return new Promise((resolve) => {
    const res = {
      _status: 200,
      status(code: number) {
        res._status = code;
        return res;
      },
      // `badRequest`/`notFound` call res.status(...).json(...); resolve on json.
      json: (payload: unknown) => resolve({ status: res._status, body: payload }),
      send: (payload: unknown) => resolve({ status: res._status, body: payload }),
    } as any;
    const req: any = { query, params: {} };
    return handler(req, res);
  });
}

/** A fully-populated witnessed-run row (the AC1 complete join shape). */
function completeRow(): Record<string, unknown> {
  return {
    request_id: '11111111-1111-4111-8111-111111111111',
    workflow_instance_id: 'wf-0007',
    node_id: 'node-admission',
    envelope: { id: 'env-1', evaluationFingerprint: 'sha256:fp', contractId: 'c-1', contractVersion: 1, contractDigest: 'sha256:x' },
    manifest: { id: 'm-1', version: 1, digest: 'sha256:m' },
    law: { propositionIds: ['p-1'], doctrineIds: ['d-1'], evaluatorId: 'e-1' },
    assessment: { disposition: 'allow', status: 'admitted', reason: null },
    evidence: { ids: ['ev-1'], fingerprint: 'sha256:ev' },
    replay: { fixtureId: 'F01', status: 'replay_ok' },
    peb_admission: '77777777-3333-4444-8555-666666666666',
    conduit_transition: '88888888-4444-4555-8666-777777777777',
  };
}

const QUERY = { workflow_instance_id: 'wf-0007', node_id: 'node-admission' };

export async function runWitnessedRunRoutesConformance(): Promise<void> {
  // ── AC1 complete join (route-level) ───────────────────────────────────────
  {
    const handler = witnessedRunHandler(new MockPool([completeRow()]) as unknown as Pool);
    const { status, body } = await callHandler(handler, QUERY);
    assert(status === 200, 'complete join should be HTTP 200');
    const p = body.projection;
    assert(p.status === 'complete', 'AC1 complete join should classify complete');
    assert(p.envelope.id === 'env-1', 'envelope projected');
    assert(p.receipts.pebAdmission === '77777777-3333-4444-8555-666666666666', 'peb admission projected');
    assert(p.receipts.conduitTransition === '88888888-4444-4555-8666-777777777777', 'conduit transition projected');
    assert(p.workflow.instanceId === 'wf-0007', 'workflow identity preserved (AC4 no browser reconstruction)');
  }

  // ── AC2 classification matrix (unit) ──────────────────────────────────────
  const classify = (over: Partial<Record<string, unknown>>): WitnessedRunStatus => {
    const base = completeRow();
    const row = { ...base, ...(over.row ?? {}) };
    return classifyWitnessedRunStatus({
      envelope: over.envelope as Record<string, unknown> ?? (base.envelope as Record<string, unknown>),
      manifest: over.manifest as Record<string, unknown> ?? (base.manifest as Record<string, unknown>),
      assessment: over.assessment as Record<string, unknown> ?? (base.assessment as Record<string, unknown>),
      replay: over.replay as Record<string, unknown> ?? (base.replay as Record<string, unknown>),
      row,
    });
  };
  const produced = new Set<WitnessedRunStatus>();
  produced.add(classify({})); // complete
  produced.add(classify({ envelope: { id: null, evaluationFingerprint: null } }));
  produced.add(classify({ manifest: { id: null } }));
  produced.add(classify({ replay: { fixtureId: 'F01', status: 'stale' } }));
  produced.add(classify({ assessment: { disposition: 'refuse', status: 'refused' } }));
  produced.add(classify({ replay: { fixtureId: 'F01', status: 'drift' } }));
  produced.add(classify({ replay: { fixtureId: 'F01', status: 'duplicate_retry' } }));

  assert(produced.has('complete'), 'AC2 complete state produced');
  assert(produced.has('missing_lineage'), 'AC2 missing_lineage state produced');
  assert(produced.has('stale'), 'AC2 stale state produced');
  assert(produced.has('refusal'), 'AC2 refusal state produced');
  assert(produced.has('drift'), 'AC2 drift state produced');
  assert(produced.has('duplicate_retry'), 'AC2 duplicate_retry state produced');

  // ── AC3 PEB / Conduit receipt-reference separation ───────────────────────
  assert(classify({}) === 'complete', 'full lineage is complete');
  const missingConduit = { peb_admission: '77777777-3333-4444-8555-666666666666', conduit_transition: null };
  assert(classify({ row: missingConduit }) === 'missing_lineage',
    'AC3 missing conduit transition -> missing_lineage (PEB reference preserved, no fabricated Conduit id)');

  const payload = callHandler(
    witnessedRunHandler(new MockPool([completeRow()]) as unknown as Pool),
    QUERY,
  );
  const p = (await payload).body.projection;
  const allDistinct = new Set([p.receipts.pebAdmission, p.receipts.conduitTransition]);
  assert(allDistinct.size === 2, 'AC3 PEB and Conduit receipt ids remain distinct');

  // ── AC5 partial / missing lineage + edge states ──────────────────────────
  // PR #70 review finding: a row with NO lineage at all must classify as
  // 'unknown' (indeterminate), not 'missing_lineage' (partial witnessed run).
  assert(
    classify({
      envelope: { id: null, evaluationFingerprint: null },
      manifest: { id: null },
      row: { peb_admission: null, conduit_transition: null, evidence: null },
    }) === 'unknown',
    'AC5 empty lineage -> unknown (indeterminate, not a partial witnessed run)',
  );
  // A row with SOME lineage but not all still classifies as missing_lineage.
  assert(
    classify({
      envelope: { id: 'env-1', evaluationFingerprint: 'sha256:fp' },
      manifest: { id: null },
      row: { peb_admission: null, conduit_transition: null, evidence: null },
    }) === 'missing_lineage',
    'AC5 partial lineage (envelope only) -> missing_lineage',
  );
  assert(classify({ manifest: { id: null } }) === 'missing_lineage', 'AC5 missing manifest -> missing_lineage');
  assert(classify({ envelope: { id: null, evaluationFingerprint: null } }) === 'missing_lineage', 'AC5 missing envelope -> missing_lineage');
  assert(classify({ replay: { fixtureId: 'F01', status: 'stale' } }) === 'stale', 'AC5 stale classified');
  assert(classify({ assessment: { disposition: 'refuse', status: 'refused' } }) === 'refusal', 'AC5 refusal classified');
  assert(classify({ replay: { fixtureId: 'F01', status: 'drift' } }) === 'drift', 'AC5 drift classified');
  assert(classify({ replay: { fixtureId: 'F01', status: 'duplicate_retry' } }) === 'duplicate_retry', 'AC5 duplicate retry classified');

  // not-found path
  const nf = await callHandler(
    witnessedRunHandler(new MockPool([]) as unknown as Pool),
    QUERY,
  );
  assert(nf.status === 404, 'no matching row -> 404');

  console.log('witnessed-run routes: conformance passed');
}

// Self-run when executed directly via tsx.
if (typeof require !== 'undefined' && require.main === module) {
  runWitnessedRunRoutesConformance().then(
    () => {
      console.log('ALL GREEN');
      process.exit(0);
    },
    (err) => {
      console.error(err?.message ?? err);
      process.exit(2);
    },
  );
}
import {
  classifyWitnessedRun,
  emptyProjection,
  normalizeProjection,
  ReadOnlyWitnessedRunAdapter,
  type WitnessedRunProjection,
} from "./witnessedRun.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function completeProjection(): WitnessedRunProjection {
  return {
    workflow: { instanceId: "wrong", nodeId: "wrong" },
    envelope: { id: "env-1", evaluationFingerprint: "sha256:fp", contractId: "contract-1", contractVersion: 1, contractDigest: "sha256:contract" },
    manifest: { id: "manifest-1", version: 1, digest: "sha256:manifest" },
    law: { propositionIds: ["prop-1"], doctrineIds: ["doc-1"], evaluatorId: "eval-1" },
    assessment: { disposition: "allow", status: "admitted", reason: null },
    receipts: { pebAdmission: "peb-1", conduitTransition: "conduit-1" },
    evidence: { ids: ["evidence-1"], fingerprint: "sha256:evidence" },
    replay: { fixtureId: "F01", status: "replay_ok" },
    status: "unknown",
  };
}

export async function runWitnessedRunConformance(): Promise<void> {
  const query = { workflowInstanceId: "wf-1", nodeId: "node-1" };
  const complete = normalizeProjection(completeProjection(), query);
  assert(complete.status === "complete", "complete projection should be complete");
  assert(complete.workflow.instanceId === "wf-1" && complete.workflow.nodeId === "node-1", "query identity must be authoritative");

  assert(emptyProjection(query).status === "missing_lineage", "empty projection should be missing lineage");
  assert(classifyWitnessedRun({ ...complete, receipts: { ...complete.receipts, conduitTransition: null } }).status === "missing_lineage", "missing receipt should be visible");
  assert(classifyWitnessedRun({ ...complete, replay: { ...complete.replay, status: "stale" } }).status === "stale", "stale replay should be visible");
  assert(classifyWitnessedRun({ ...complete, assessment: { ...complete.assessment, status: "refused" } }).status === "refusal", "refusal should be visible");
  assert(classifyWitnessedRun({ ...complete, replay: { ...complete.replay, status: "drift" } }).status === "drift", "drift should be visible");
  assert(classifyWitnessedRun({ ...complete, replay: { ...complete.replay, status: "duplicate_retry" } }).status === "duplicate_retry", "duplicate retry should be visible");

  const adapter = new ReadOnlyWitnessedRunAdapter({ query: async () => null });
  assert((await adapter.get(query)).status === "missing_lineage", "null source should produce read-only empty projection");
}

export type WitnessedRunStatus =
  | "complete"
  | "missing_lineage"
  | "unknown"
  | "stale"
  | "refusal"
  | "drift"
  | "duplicate_retry";

export interface WitnessedRunQuery {
  workflowInstanceId: string;
  nodeId: string;
}

export interface WitnessedRunProjection {
  workflow: {
    instanceId: string;
    nodeId: string;
  };
  envelope: {
    id: string | null;
    evaluationFingerprint: string | null;
    contractId: string | null;
    contractVersion: number | null;
    contractDigest: string | null;
  };
  manifest: {
    id: string | null;
    version: number | null;
    digest: string | null;
  };
  law: {
    propositionIds: string[];
    doctrineIds: string[];
    evaluatorId: string | null;
  };
  assessment: {
    disposition: string | null;
    status: string | null;
    reason: string | null;
  };
  receipts: {
    pebAdmission: string | null;
    conduitTransition: string | null;
  };
  evidence: {
    ids: string[];
    fingerprint: string | null;
  };
  replay: {
    fixtureId: string | null;
    status: string | null;
  };
  status: WitnessedRunStatus;
}

export interface WitnessedRunSource {
  query(query: WitnessedRunQuery, signal?: AbortSignal): Promise<WitnessedRunProjection | null>;
}

export class WitnessedRunAdapterError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "WitnessedRunAdapterError";
  }
}

export class ReadOnlyWitnessedRunAdapter {
  constructor(private readonly source: WitnessedRunSource) {}

  async get(query: WitnessedRunQuery, signal?: AbortSignal): Promise<WitnessedRunProjection> {
    if (!query.workflowInstanceId || !query.nodeId) {
      throw new WitnessedRunAdapterError("Workflow instance and node IDs are required", "INVALID_WITNESSED_RUN_QUERY");
    }
    const projection = await this.source.query(query, signal);
    if (!projection) return emptyProjection(query, "missing_lineage");
    return normalizeProjection(projection, query);
  }
}

export function emptyProjection(
  query: WitnessedRunQuery,
  status: WitnessedRunStatus = "missing_lineage",
): WitnessedRunProjection {
  return {
    workflow: { instanceId: query.workflowInstanceId, nodeId: query.nodeId },
    envelope: { id: null, evaluationFingerprint: null, contractId: null, contractVersion: null, contractDigest: null },
    manifest: { id: null, version: null, digest: null },
    law: { propositionIds: [], doctrineIds: [], evaluatorId: null },
    assessment: { disposition: null, status: null, reason: null },
    receipts: { pebAdmission: null, conduitTransition: null },
    evidence: { ids: [], fingerprint: null },
    replay: { fixtureId: null, status: null },
    status,
  };
}

export function normalizeProjection(
  projection: WitnessedRunProjection,
  query: WitnessedRunQuery,
): WitnessedRunProjection {
  const normalized: WitnessedRunProjection = {
    ...projection,
    workflow: { instanceId: query.workflowInstanceId, nodeId: query.nodeId },
    law: {
      ...projection.law,
      propositionIds: [...projection.law.propositionIds],
      doctrineIds: [...projection.law.doctrineIds],
    },
    evidence: { ...projection.evidence, ids: [...projection.evidence.ids] },
  };
  return classifyWitnessedRun(normalized);
}

export function classifyWitnessedRun(projection: WitnessedRunProjection): WitnessedRunProjection {
  if (!projection.envelope.id || !projection.envelope.evaluationFingerprint) return { ...projection, status: "missing_lineage" };
  if (projection.replay.status === "stale" || projection.assessment.status === "stale") return { ...projection, status: "stale" };
  if (projection.replay.status === "drift" || projection.assessment.status === "drift") return { ...projection, status: "drift" };
  if (projection.replay.status === "duplicate_retry") return { ...projection, status: "duplicate_retry" };
  if (projection.assessment.status === "refused" || projection.assessment.disposition === "refuse") return { ...projection, status: "refusal" };
  if (!projection.manifest.id || !projection.receipts.pebAdmission || !projection.receipts.conduitTransition || projection.evidence.ids.length === 0) {
    return { ...projection, status: "missing_lineage" };
  }
  return { ...projection, status: "complete" };
}

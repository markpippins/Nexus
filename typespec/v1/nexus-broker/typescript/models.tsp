/**
 * nexus-broker — TypeSpec Models
 *
 * Worker-tier Moleculer broker (D-2026-08-14-002).
 */
namespace org.nexus.nexusbroker {

  /** GET /api/health response. */
  model Health {
    /** Literal "ok". */
    status: string;
    /** Broker name ("nexus-broker"). */
    service: string;
    /** Broker namespace ("nexus"). */
    `namespace`: string;
    /** Declared worker-tier services (populated as each Wave 4 migration lands). */
    workers: string[];
    /** ISO timestamp. */
    timestamp: string;
  }

  /** A worker-tier service entry. */
  model WorkerEntry {
    /** Service name, e.g. "worker.harness". */
    name: string;
    /** Scaffold status until Wave 4 lands the real handlers. */
    status: string;
    /** Migration wave that implements it. */
    wave: int32;
  }

  /** GET /api/workers response. */
  model Workers {
    workers: WorkerEntry[];
    nodeID: string;
  }

  /** GET /api/solir/status response. */
  model SolIrStatus {
    enabled: boolean;
    intervalMs: int32;
    latestSnapshot: int32 | null;
    latestSnapshotAt: string | null;
  }

  /** POST /api/solir/snapshot request body. */
  model SolIrSnapshotRequest {
    /** Optional label; defaults to snapshot-vN. */
    label?: string;
  }

  /** POST /api/solir/snapshot response. */
  model SolIrSnapshotResult {
    ok: boolean;
    version: int32;
    label: string;
    observations: int32;
    assessments: int32;
    driftFindings: int32;
    prevVersion: int32;
  }
}

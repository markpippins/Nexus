/**
 * nexus-broker — TypeSpec Operations
 *
 * Worker-tier Moleculer broker (D-2026-08-14-002). The moleculer-web API
 * gateway exposes broker-level introspection (health + worker status);
 * worker actions land with each Wave 4 migration.
 */

import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.nexusbroker {

  // ========================================================================
  // Health
  // ========================================================================

  @route("/api/health")
  @get
  @doc("Broker health: status, namespace, declared worker tier.")
  op health(): Health;

  // ========================================================================
  // Workers
  // ========================================================================

  @route("/api/workers")
  @get
  @doc("List the declared worker-tier services and their scaffold status.")
  op listWorkers(): Workers;

  // ========================================================================
  // SOL IR (Wave 0.4)
  // ========================================================================

  @route("/api/solir/status")
  @get
  @doc("SOL IR sync status: interval, latest snapshot version.")
  op solirStatus(): SolIrStatus;

  @route("/api/solir/snapshot")
  @post
  @doc("Trigger a SOL IR snapshot: PG canonical -> Mongo projection + drift re-evaluation.")
  op solirSnapshot(@body body: SolIrSnapshotRequest): SolIrSnapshotResult;
}

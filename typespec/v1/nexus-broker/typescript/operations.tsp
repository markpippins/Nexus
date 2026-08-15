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

  // ========================================================================
  // Worker tier (Wave 4 — harness/pty/execution as Moleculer workers)
  // ========================================================================

  @route("/api/workers/execution")
  @get
  @doc("Execution worker health: DB connectivity + schema counts (read-only observability).")
  op executionHealth(): WorkerHealth;

  @route("/api/workers/pty")
  @get
  @doc("List live pty sessions.")
  op ptyList(): PtyList;

  @route("/api/workers/pty")
  @post
  @doc("Spawn a pty session.")
  op ptySpawn(@body body: PtySpawnRequest): PtySession;

  @route("/api/workers/pty/{id}")
  @delete
  @doc("Terminate a pty session.")
  op ptyKill(@path id: string): Record<unknown>;

  @route("/api/workers/harness")
  @get
  @doc("Harness worker health: DB connectivity + active session count.")
  op harnessHealth(): WorkerHealth;

  @route("/api/workers/harness/run")
  @post
  @doc("Resolve context and execute an agent run for a wind task.")
  op harnessRun(@body body: HarnessRunRequest): Record<unknown>;

  @route("/api/workers/harness/resolve-context")
  @post
  @doc("Resolve the agent context (role, prompt, task, harness) for a wind task without executing.")
  op harnessResolveContext(@body body: HarnessResolveRequest): Record<unknown>;

  @route("/api/workers/harness/sessions")
  @get
  @doc("List active harness sessions.")
  op harnessSessions(): HarnessSessions;
}

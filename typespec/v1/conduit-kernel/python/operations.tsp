/**
 * conduit-kernel — TypeSpec Operations
 *
 * Reverse-engineered from python/conduit/app/main.py + app/api/routes_*.py
 * (FastAPI). Router mounts (include_router prefix) are folded into full paths:
 *   delta → /delta, state → /state, replay → /replay, admin → /admin,
 *   sessions → /api/sessions, breaker → /api/breaker, receipts → /api/receipts.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.conduitkernel {

  // ========================================================================
  // Root / liveness
  // ========================================================================

  @route("/metrics")
  @get
  @doc("Prometheus metrics endpoint.")
  op metrics(): MetricsResponse;

  @route("/healthz")
  @get
  @doc("Liveness probe.")
  op healthz(): unknown;

  @route("/readyz")
  @get
  @doc("Readiness probe.")
  op readyz(): unknown;

  @route("/")
  @get
  @doc("Service root.")
  op root(): unknown;

  // ========================================================================
  // Receipts (/api/receipts)
  // ========================================================================

  @route("/api/receipts/{plan_id}")
  @get
  @doc("Get the receipt for a plan.")
  op getReceipt(@path plan_id: string): ReceiptResponse | unknown;

  @route("/api/receipts/{plan_id}/raw")
  @get
  @doc("Get the raw (unwrapped) receipt for a plan.")
  op getReceiptRaw(@path plan_id: string): unknown;

  @route("/api/receipts/{plan_id}/latest-type")
  @get
  @doc("Get the latest receipt type for a plan.")
  op getReceiptLatestType(@path plan_id: string): unknown;

  @route("/api/receipts")
  @post
  @doc("Create a receipt.")
  op createReceipt(@body body: unknown): ReceiptResponse | unknown;

  @route("/api/receipts/{plan_id}")
  @delete
  @doc("Delete a plan's receipts.")
  op deleteReceipt(@path plan_id: string): unknown;

  // ========================================================================
  // State (/state)
  // ========================================================================

  @route("/state")
  @get
  @doc("List state entries.")
  op listState(): unknown;

  @route("/state/identity/{identity_id}")
  @get
  @doc("Get an identity's state.")
  op getIdentityState(@path identity_id: string): IdentityResponse | unknown;

  @route("/state/receipt/{receipt_id}")
  @get
  @doc("Get state for a receipt.")
  op getReceiptState(@path receipt_id: string): unknown;

  @route("/state/receipts-by-plan/{plan_num}")
  @get
  @doc("List receipts for a plan number.")
  op getReceiptsByPlan(@path plan_num: string): unknown;

  @route("/state/graph")
  @get
  @doc("Get the state graph.")
  op getStateGraph(): GraphResponse | unknown;

  @route("/state/plan/{plan_num}")
  @get
  @doc("Get plan detail.")
  op getPlanDetail(@path plan_num: string): PlanDetailResponse | unknown;

  @route("/state/health")
  @get
  @doc("State subsystem health.")
  op stateHealth(): unknown;

  @route("/state/lineage")
  @get
  @doc("Get state lineage.")
  op getLineage(): unknown;

  // ========================================================================
  // Replay (/replay)
  // ========================================================================

  @route("/replay")
  @get
  @doc("List replay runs.")
  op listReplay(): ReplayResponse | unknown;

  @route("/replay/compare")
  @get
  @doc("Compare replay runs.")
  op compareReplay(): CompareResponse | unknown;

  // ========================================================================
  // Sessions (/api/sessions)
  // ========================================================================

  @route("/api/sessions")
  @get
  @doc("List sessions.")
  op listSessions(): SessionListResponse | unknown;

  @route("/api/sessions/running")
  @get
  @doc("List running sessions.")
  op listRunningSessions(): SessionListResponse | unknown;

  @route("/api/sessions/stale")
  @get
  @doc("List stale sessions.")
  op listStaleSessions(): SessionListResponse | unknown;

  @route("/api/sessions/{session_id}")
  @get
  @doc("Get a session.")
  op getSession(@path session_id: string): SessionResponse | unknown;

  @route("/api/sessions/{session_id}/cost")
  @patch
  @doc("Update a session's cost.")
  op updateSessionCost(@path session_id: string, @body body: unknown): SessionResponse | unknown;

  @route("/api/sessions/{session_id}/heartbeat")
  @post
  @doc("Send a session heartbeat.")
  op sessionHeartbeat(@path session_id: string): SessionResponse | unknown;

  @route("/api/sessions/{session_id}/kill")
  @post
  @doc("Kill a session.")
  op killSession(@path session_id: string): SessionResponse | unknown;

  // ========================================================================
  // Admin (/admin)
  // ========================================================================

  @route("/admin/identities")
  @get
  @doc("List identities.")
  op listIdentities(): IdentityListResponse | unknown;

  @route("/admin/identities/{identity_id}")
  @patch
  @doc("Update an identity.")
  op updateIdentity(@path identity_id: string, @body body: unknown): IdentityUpdateResponse | unknown;

  @route("/admin/identities/{identity_id}")
  @delete
  @doc("Delete an identity.")
  op deleteIdentity(@path identity_id: string): unknown;

  @route("/admin/consistency")
  @get
  @doc("Run a consistency check.")
  op checkConsistency(): ConsistencyCheck | unknown;

  // ========================================================================
  // Breaker (/api/breaker)
  // ========================================================================

  @route("/api/breaker")
  @get
  @doc("Get circuit breaker state.")
  op getBreaker(): BreakerStateResponse | unknown;

  @route("/api/breaker/trip")
  @post
  @doc("Trip the circuit breaker.")
  op tripBreaker(@body body: unknown): BreakerStateResponse | unknown;

  @route("/api/breaker/reset")
  @post
  @doc("Reset the circuit breaker.")
  op resetBreaker(): BreakerStateResponse | unknown;

  @route("/api/breaker/pause")
  @post
  @doc("Pause the circuit breaker.")
  op pauseBreaker(): BreakerStateResponse | unknown;

  @route("/api/breaker/resume")
  @post
  @doc("Resume the circuit breaker.")
  op resumeBreaker(): BreakerStateResponse | unknown;

  @route("/api/breaker/failure-recovery")
  @get
  @doc("Get failure-recovery status.")
  op getFailureRecovery(): unknown;

  @route("/api/breaker/failure-recovery")
  @post
  @doc("Trigger failure recovery.")
  op runFailureRecovery(@body body: unknown): unknown;

  // ========================================================================
  // Delta (/delta)
  // ========================================================================

  @route("/delta")
  @post
  @doc("Apply a delta.")
  op applyDelta(@body body: unknown): DeltaResponse | unknown;

  @route("/delta/state")
  @get
  @doc("Get delta-derived state summary.")
  op getDeltaState(): StateSummary | unknown;
}

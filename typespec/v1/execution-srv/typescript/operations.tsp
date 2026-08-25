/**
 * execution-srv — TypeSpec Operations
 *
 * Reverse-engineered from typescript/execution-srv/src/routes.ts.
 * All routes live under /api/execution. Query parameters (status, search,
 * limit, offset, executor_id) are documented in prose, not @query decorators.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.executionsrv {

  // ── Health ────────────────────────────────────────────────────
  @route("/health")
  @get
  @doc("Service health probe.")
  op health(): HealthResponse;

  // ── Paginated lists ───────────────────────────────────────────
  // Query params: ?status=&search=&limit=20&offset=0
  @route("/requests")
  @get
  @doc("Paginated execution requests.")
  op listRequests(): RequestList;

  @route("/leases")
  @get
  @doc("Paginated execution leases.")
  op listLeases(): LeaseList;

  @route("/attempts")
  @get
  @doc("Paginated execution attempts.")
  op listAttempts(): AttemptList;

  @route("/receipts")
  @get
  @doc("Paginated execution receipts (?type= filter).")
  op listReceipts(): ReceiptList;

  // ── Request lifecycle ─────────────────────────────────────────
  @route("/requests/{id}/state")
  @get
  @doc("Aggregate lifecycle state for a request (request + lease + latest attempt + receipts).")
  op requestState(@path id: string): RequestState | ErrorDetail;

  @route("/requests/{id}/attempts")
  @get
  @doc("All attempts for a request.")
  op requestAttempts(@path id: string): AttemptList | ErrorDetail;

  @route("/requests/{id}/receipts/lineage")
  @get
  @doc("Receipt lineage tree for a request.")
  op requestReceiptLineage(@path id: string): { receipts: ExecutionReceipt[] } | ErrorDetail;

  // ── Lease integrity ───────────────────────────────────────────
  @route("/leases/stale")
  @get
  @doc("Leases past their expiry that are still in active status.")
  op staleLeases(): { leases: StaleLease[] };

  @route("/leases/{id}/lifecycle")
  @get
  @doc("Full lifecycle for one lease (lease + all attempts).")
  op leaseLifecycle(@path id: string): LeaseLifecycle | ErrorDetail;

  // ── Cross-table scans ─────────────────────────────────────────
  @route("/health/integrity-scan")
  @get
  @doc("Cross-table consistency scan (orphaned attempts/receipts, stale leases).")
  op integrityScan(): IntegrityScan;

  // ── Fleet view ────────────────────────────────────────────────
  @route("/health/by-executor")
  @get
  @doc("Active leases + attempt stats per executor (?executor_id= filter).")
  op healthByExecutor(): { executors: ExecutorHealth[] };

  @route("/health/status-distribution")
  @get
  @doc("Count of requests/leases/attempts by status.")
  op statusDistribution(): { request_statuses: StatusDistribution[]; lease_statuses: StatusDistribution[]; attempt_statuses: StatusDistribution[] };

  // ── Pipeline origin ───────────────────────────────────────────
  @route("/receipts/{id}/pipeline-origin")
  @get
  @doc("Trace a receipt back to its originating pipeline (vision.receipts cross-reference).")
  op pipelineOrigin(@path id: string): PipelineOrigin | ErrorDetail;
}
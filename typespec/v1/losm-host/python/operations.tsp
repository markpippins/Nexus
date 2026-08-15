/**
 * losm-host — TypeSpec Operations
 *
 * Reverse-engineered from python/vision/losm-host/losm/app/main.py +
 * losm/api/*.py (FastAPI). APIRouter prefixes are folded into full paths:
 *   receipts → /receipts, work-requests → /work-requests,
 *   artifacts → /artifacts, branches → /branches, kernel → /kernel.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.losmhost {

  @route("/health")
  @get
  @doc("Liveness probe.")
  op health(): unknown;

  // ========================================================================
  // Receipts
  // ========================================================================

  @route("/receipts/ingest")
  @post
  @doc("Ingest a receipt.")
  op ingestReceipt(@body body: unknown): ReceiptIngestResponse | unknown;

  // ========================================================================
  // Work requests
  // ========================================================================

  @route("/work-requests")
  @post
  @doc("Create a work request.")
  op createWorkRequest(@body body: unknown): WorkRequestResponse | unknown;

  @route("/work-requests/{wr_id}")
  @get
  @doc("Get a work request.")
  op getWorkRequest(@path wr_id: string): WorkRequestResponse | unknown;

  @route("/work-requests")
  @get
  @doc("List work requests.")
  op listWorkRequests(): WorkRequestResponse[] | unknown;

  @route("/work-requests/{wr_id}/orchestrate")
  @post
  @doc("Orchestrate a work request.")
  op orchestrateWorkRequest(@path wr_id: string, @body body: unknown): unknown;

  @route("/work-requests/{wr_id}/transition")
  @post
  @doc("Transition a work request.")
  op transitionWorkRequest(@path wr_id: string, @body body: unknown): WorkRequestResponse | unknown;

  @route("/work-requests/{wr_id}/compile")
  @post
  @doc("Compile a work request into SpecIR.")
  op compileWorkRequest(@path wr_id: string, @body body: unknown): SpecIR | unknown;

  // ========================================================================
  // Artifacts
  // ========================================================================

  @route("/artifacts/wr/{wr_id}")
  @get
  @doc("List artifacts for a work request.")
  op listArtifacts(@path wr_id: string): unknown;

  @route("/artifacts/{artifact_id}/lineage")
  @get
  @doc("Get an artifact's lineage.")
  op artifactLineage(@path artifact_id: string): unknown;

  // ========================================================================
  // Branches
  // ========================================================================

  @route("/branches")
  @post
  @doc("Create a branch.")
  op createBranch(@body body: unknown): BranchResponse | unknown;

  @route("/branches/{branch_id}/fork")
  @post
  @doc("Fork a branch.")
  op forkBranch(@path branch_id: string, @body body: unknown): BranchResponse | unknown;

  @route("/branches/{branch_id}")
  @get
  @doc("Get a branch.")
  op getBranch(@path branch_id: string): BranchResponse | unknown;

  @route("/branches/wr/{wr_id}")
  @get
  @doc("List branches for a work request.")
  op listBranches(@path wr_id: string): BranchResponse[] | unknown;

  @route("/branches/{branch_id}/score")
  @post
  @doc("Score a branch.")
  op scoreBranch(@path branch_id: string, @body body: unknown): unknown;

  @route("/branches/{branch_id}/merge")
  @post
  @doc("Merge a branch.")
  op mergeBranch(@path branch_id: string, @body body: unknown): unknown;

  @route("/branches/{branch_id}/discard")
  @post
  @doc("Discard a branch.")
  op discardBranch(@path branch_id: string): unknown;

  @route("/branches/wr/{wr_id}/best")
  @get
  @doc("Get the best branch for a work request.")
  op bestBranch(@path wr_id: string): BranchResponse | unknown;

  // ========================================================================
  // Kernel
  // ========================================================================

  @route("/kernel/validate-graph")
  @post
  @doc("Validate a kernel graph.")
  op validateGraph(@body body: unknown): unknown;
}

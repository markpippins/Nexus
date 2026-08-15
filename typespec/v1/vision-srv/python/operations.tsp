/**
 * vision-srv — TypeSpec Operations
 *
 * Reverse-engineered from python/vision-srv/src/vision_srv/main.py (FastAPI).
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.visionsrv {

  @route("/health")
  @get
  @doc("Liveness probe.")
  op health(): unknown;

  // ========================================================================
  // Work requests (/api/work-requests)
  // ========================================================================

  @route("/api/work-requests")
  @get
  @doc("List work requests.")
  op listWorkRequests(): WorkRequestResponse[] | unknown;

  @route("/api/work-requests/{wr_id}")
  @get
  @doc("Get a work request.")
  op getWorkRequest(@path wr_id: string): WorkRequestResponse | unknown;

  @route("/api/work-requests")
  @post
  @doc("Create a work request.")
  op createWorkRequest(@body body: unknown): WorkRequestResponse | unknown;

  @route("/api/work-requests/{wr_id}")
  @patch
  @doc("Update a work request.")
  op updateWorkRequest(@path wr_id: string, @body body: unknown): WorkRequestResponse | unknown;

  @route("/api/work-requests/{wr_id}")
  @delete
  @doc("Delete a work request.")
  op deleteWorkRequest(@path wr_id: string): unknown;

  @route("/api/work-requests/{wr_id}/dag")
  @get
  @doc("Get a work request's DAG.")
  op getWorkRequestDag(@path wr_id: string): unknown;

  @route("/api/work-requests/{wr_id}/dag/path/{target_wr_id}")
  @get
  @doc("Get a DAG path between two work requests.")
  op getDagPath(@path wr_id: string, @path target_wr_id: string): unknown;

  @route("/api/work-requests/{wr_id}/dag/validate")
  @get
  @doc("Validate a work request's DAG.")
  op validateDag(@path wr_id: string): unknown;

  // ========================================================================
  // Branches (/api/branches)
  // ========================================================================

  @route("/api/branches")
  @get
  @doc("List branches.")
  op listBranches(): BranchResponse[] | unknown;

  @route("/api/branches")
  @post
  @doc("Create a branch.")
  op createBranch(@body body: unknown): BranchResponse | unknown;

  // ========================================================================
  // Artifacts (/api/artifacts)
  // ========================================================================

  @route("/api/artifacts")
  @get
  @doc("List artifacts.")
  op listArtifacts(): ArtifactResponse[] | unknown;

  @route("/api/artifacts")
  @post
  @doc("Create an artifact.")
  op createArtifact(@body body: unknown): ArtifactResponse | unknown;
}

/**
 * tackle-mcp — TypeSpec Operations
 *
 * Reverse-engineered from python/tackle/planner_mcp_server.py (FastMCP
 * "planner-mcp"). Each @mcp.tool() becomes an op under /tools/<name>.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.tacklemcp {

  @route("/tools/check_completion_evidence")
  @post
  @doc("Check completion evidence for a candidate.")
  op check_completion_evidence(@body body: CandidateIdRequest): string;

  @route("/tools/check_duplicate_candidates")
  @post
  @doc("Check for duplicate candidates.")
  op check_duplicate_candidates(@body body: CandidateIdRequest): string;

  @route("/tools/check_work_request_overlap")
  @post
  @doc("Check work-request overlap for a candidate.")
  op check_work_request_overlap(@body body: CandidateIdRequest): string;

  @route("/tools/get_candidate_questions")
  @post
  @doc("Get candidate questions.")
  op get_candidate_questions(@body body: CandidateIdRequest): string;

  @route("/tools/write_duplicate_question")
  @post
  @doc("Write a duplicate question for a candidate.")
  op write_duplicate_question(@body body: DuplicateQuestionRequest): string;

  @route("/tools/write_evidence_question")
  @post
  @doc("Write an evidence question for a candidate.")
  op write_evidence_question(@body body: EvidenceQuestionRequest): string;

  @route("/tools/assess_candidate_relevance")
  @post
  @doc("Assess a candidate's relevance.")
  op assess_candidate_relevance(@body body: RelevanceRequest): string;

  @route("/tools/check_hierarchy_evidence")
  @post
  @doc("Check hierarchy evidence for a candidate.")
  op check_hierarchy_evidence(@body body: CandidateIdRequest): string;

  @route("/tools/check_tag_evidence")
  @post
  @doc("Check tag evidence for a candidate.")
  op check_tag_evidence(@body body: CandidateIdRequest): string;

  @route("/tools/check_completion_status")
  @post
  @doc("Check completion status for a candidate.")
  op check_completion_status(@body body: CandidateIdRequest): string;
}

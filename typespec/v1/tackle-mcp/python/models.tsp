/**
 * tackle-mcp — TypeSpec Models
 *
 * Reverse-engineered from python/tackle/planner_mcp_server.py (FastMCP).
 * No route or verb decorators live here.
 */
namespace org.nexus.tacklemcp {

  /** Candidate identifier request. */
  model CandidateIdRequest {
    candidateId: string;
  }

  /** Duplicate-question write request. */
  model DuplicateQuestionRequest {
    candidateId: string;
    duplicateOfTitle: string;
  }

  /** Evidence-question write request. */
  model EvidenceQuestionRequest {
    candidateId: string;
    evidenceType: string;
  }

  /** Candidate relevance assessment request. */
  model RelevanceRequest {
    candidateId: string;
    writeQuestions?: boolean;
  }
}

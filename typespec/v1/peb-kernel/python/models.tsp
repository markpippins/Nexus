/**
 * peb-kernel — TypeSpec Models
 *
 * Reverse-engineered from python/peb-kernel/src/peb_kernel/api.py (FastAPI).
 * No route or verb decorators live here.
 */
namespace org.nexus.pebkernel {

  /** Admission request for a PEB transaction. */
  model PebTransactionRequest {
    /** Optional caller-supplied UUID; the Python domain assigns one when omitted. */
    @format("uuid")
    id?: string;
    idempotencyKey: string;
    entityId: string;
    toolName: string;
    input: unknown;
  }

  /** Admission decision shared with the Spring PEB contract. */
  model AdmissionResponse {
    message: string;
    admitted: boolean;
  }

  /** Health response. */
  model PebHealthResponse {
    status: string;
    database?: string;
    schema?: string;
  }

  /** State digest served at GET /api/v1/peb/state/hash. */
  model PebStateHashResponse {
    /** Sorted-leaf Merkle root over state rows + latest decision after_hash. */
    peb_state_hash: string;
    /** state_key -> checksum for every state row (keys sorted). */
    document_hashes: Record<string, string>;
    /** Latest decision after_hash (before_hash fallback), "" when none. */
    last_decision_hash: string;
    /** Digest over peb_state_hash + last_decision_hash (no separate store). */
    thought_context_hash: string;
    /** Static "operational" — no cognitive-mode store exists. */
    cognitive_mode: string;
  }
}

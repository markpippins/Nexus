/**
 * peb-kernel — TypeSpec Models
 *
 * Reverse-engineered from python/peb-kernel/src/peb_kernel/api.py (FastAPI).
 * No route or verb decorators live here.
 */
namespace org.nexus.pebkernel {

  /** Admission request for a PEB transaction. */
  model PebTransactionRequest {
    idempotencyKey: string;
    entityId: string;
    toolName: string;
    input: Record<unknown>;
  }

  /** Admission decision. */
  model AdmissionResponse {
    admitted: boolean;
    /** Admission path / disposition. */
    path?: string;
    decision?: Record<unknown>;
  }

  /** Health response. */
  model PebHealthResponse {
    status: string;
    database?: string;
    schema?: string;
  }
}

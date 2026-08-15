/**
 * losm-host — TypeSpec Models
 *
 * Reverse-engineered from python/vision/losm-host/losm (FastAPI).
 * No route or verb decorators live here.
 */
namespace org.nexus.losmhost {

  /** A work request. */
  model WorkRequestResponse {
    wrId: string;
    state?: string;
    spec?: Record<unknown>;
  }

  /** Compile result for a work request — a SpecIR artifact. */
  model SpecIR {
    ir: Record<unknown>;
  }

  /** Response from receipt ingest. */
  model ReceiptIngestResponse {
    accepted: boolean;
    receiptId?: string;
  }

  /** Branch record. */
  model BranchResponse {
    branchId: string;
    wrId?: string;
    state?: string;
  }
}

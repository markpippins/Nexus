/**
 * peb-kernel — TypeSpec Operations
 *
 * Reverse-engineered from python/peb-kernel/src/peb_kernel/api.py (FastAPI).
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.pebkernel {

  @route("/api/v1/peb/transaction")
  @post
  @doc("Submit a PEB transaction for admission.")
  op submitTransaction(@body body: PebTransactionRequest): AdmissionResponse;

  @route("/actuator/health")
  @get
  @doc("Health check.")
  op health(): PebHealthResponse;

  @route("/api/v1/peb/state/hash")
  @get
  @doc("Current PEB state digest (Merkle root, per-document hashes, decision hash).")
  op stateHash(): PebStateHashResponse;
}

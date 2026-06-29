/**
 * Nexus PEB Kernel Operations
 *
 * Single MCP facade endpoint for the Persistent Engineering Brain.
 * Dispatches to internal engines based on the toolName field.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.peb {

  // ========================================================================
  // PEB Transaction Endpoint
  // ========================================================================

  @route("/api/v1/peb")
  @tag("PEB Kernel")
  interface PebTransactionEndpoint {
    @doc("""
      Submit a transaction to the PEB governance engine.
      The toolName field determines which admission path and engine is invoked:
      - peb_validate_transition / peb_check_invariants / peb_validate_transform → VALIDATE path
      - peb_record_decision / peb_append_trace_segment / peb_request_clarification / peb_extension_proposal → MUTATE path
      - peb_report_violation → REPORT_VIOLATION path (always rejected, recorded as violation)
      - unknown toolName → ROUTED path
    """)
    @post
    @route("/transaction")
    submit(@body request: PebTransactionRequest): AdmissionResponse;
  }
}

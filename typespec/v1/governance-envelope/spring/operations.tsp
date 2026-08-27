/**
 * Governance Admission Envelope — Wire Operations
 *
 * The stable boundary for envelope evaluation + admission. Per W1.05 "Do not
 * wire all services in this item; publish the stable boundary first" — these
 * routes describe the contract surface; service wiring is a follow-up.
 *
 * Authority model (W1.03): the grant path is contract + semantic identity +
 * proposition/frame/doctrine/posture + input snapshot → SOL evaluation →
 * immutable envelope → PEB admission/transaction → sanctioned transition.
 * `evaluate` ends at the assessment; `admit` is where PEB appends the receipt.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace Governance.Admission {

  /**
   * Governance admission boundary.
   */
  @route("/api/v1/governance/admission")
  @tag("Governance Admission")
  interface GovernanceAdmissionEndpoint {
    /**
     * Evaluate an envelope and return the assessment.
     *
     * The response is assessment-only: disposition, refusal code, and the
     * evaluation fingerprint. It carries NO authority — no PEB transaction,
     * no sanctioned transition. Callers must not treat an assessment as a
     * grant (W1.01/W1.03).
     *
     * Fail-closed behavior (W1.01): missing identity/digest/law/input/
     * fingerprint, stale doctrine, contract digest mismatch, unknown
     * contract, expired lease, mismatched attempt, or evaluator uncertainty
     * returns disposition `refuse`/`unknown` with a refusal_code.
     */
    @post
    @route("/evaluate")
    evaluate(@body request: AdmissionRequest): AdmissionResult;

    /**
     * Admit an evaluated envelope — PEB appends the authority receipt.
     *
     * The request MUST carry the envelope with its immutable evaluation and
     * fingerprint. The response includes the receipt with the PEB transaction
     * and sanctioned-transition identities. This is the only surface where
     * authority is granted; the payload can never replace PEB/SOL authority
     * (AC4).
     */
    @post
    @route("/admit")
    admit(@body request: AdmissionRequest): AdmissionResult;
  }
}
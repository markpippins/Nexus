/**
 * Governance Admission Envelope — TypeSpec Contract Models
 *
 * Canonical wire boundary for the governance admission envelope (Wave 1,
 * W1.01 field contract + W1.04 serialization spec, ratified 2026-08-27).
 *
 * This contract describes the WIRE BOUNDARY only. It deliberately does NOT
 * embed doctrine law, proposition content, or evaluator implementation.
 * Law is referenced by identity (`proposition_ids[]`, `doctrine_ids[]`,
 * `posture_ids[]`); evaluation authority remains with SOL/PEB — a payload
 * constraint in this contract can never substitute for PEB/SOL authority.
 *
 * Versioning: `envelope_version` (inside the envelope) and the contract
 * version (this surface) are INDEPENDENT and explicit (AC2).
 */
namespace Governance.Admission {

  // ========================================================================
  // Enums
  // ========================================================================

  /**
   * Exact disposition vocabulary for a governed admission.
   * - allow  — admitted
   * - reject — deterministically denied (doctrine/contract violation)
   * - refuse — fail-closed refusal (missing/stale/unknown authority inputs)
   * - unknown — evaluator uncertainty; routed for clarification
   */
  enum EnvelopeDisposition {
    allow,
    reject,
    refuse,
    "unknown",
  }

  /**
   * Exact fail-closed refusal codes (W1.01: missing identity/digest/law/
   * input/fingerprint, stale doctrine, contract digest mismatch, unknown
   * contract, expired lease, mismatched attempt, evaluator uncertainty).
   */
  enum RefusalCode {
    missing_identity,
    missing_digest,
    missing_law,
    missing_input,
    missing_fingerprint,
    stale_doctrine,
    contract_digest_mismatch,
    unknown_context,
    expired_lease,
    attempt_mismatch,
    evaluator_uncertainty,
    duplicate_reuse,
  }

  /** Authority outcome appended only by PEB after admission. */
  enum AdmissionAuthorityResult {
    granted,
    refused,
    routed,
  }

  // ========================================================================
  // Contract identity — the exact interface evaluated (W1.01)
  // ========================================================================

  /** Contract identity + projection digest. Identity references only — never
   * a payload constraint that could replace PEB/SOL authority (AC4). */
  model GovernanceContract {
    /** Contract identity (UUID) */
    @format("uuid")
    contract_id: string;

    /** Contract version — independent of envelope_version (AC2) */
    contract_version: int32;

    /** SHA-256 digest of the contract artifact (`sha256:<64 hex>`) */
    contract_digest: string;

    /** Projection identity, when the evaluation runs against a projection */
    @format("uuid")
    projection_id?: string | null;

    /** Projection version */
    projection_version?: int32 | null;

    /** Projection digest (`sha256:<64 hex>`) */
    projection_digest?: string | null;

    /** Governed operation (e.g. `admit_execution`) */
    operation: string;

    /** Requested transition (e.g. `REQUESTED->EXECUTING`) */
    transition?: string | null;
  }

  // ========================================================================
  // Semantic identity — JSON-LD context + subject (W1.01)
  // ========================================================================

  /** JSON-LD semantic identity of the governed subject. */
  model SemanticIdentity {
    /** JSON-LD context IRI (absolute; relative fails closed) */
    "@context": string;

    /** Subject identifier */
    subject_id: string;

    /** Subject type (e.g. `work_request`) */
    subject_type: string;

    /** Subject reference IRI */
    subject_ref?: string | null;
  }

  // ========================================================================
  // Workflow position (W1.01)
  // ========================================================================

  /** Exact process position of the governed decision. */
  model WorkflowContext {
    workflow_id: string;
    workflow_version: int32;
    node_id: string;

    /** Work-request identity when the decision is work-request-governed */
    work_request_id?: string | null;
    work_request_version?: int32 | null;
  }

  // ========================================================================
  // Law snapshot — resolved law/context (W1.01)
  // ========================================================================

  /** A resolved frame value (e.g. execution_backend=interactive). */
  model FrameValue {
    frame: string;
    /** Scalar frame value (string, number, or boolean) */
    value: unknown;
  }

  /** Resolved law + context snapshot evaluated by SOL. */
  model LawSnapshot {
    /** UUID identities */
    proposition_ids: string[];

    frame_values: FrameValue[];

    /** UUID identities */
    doctrine_ids: string[];

    /** UUID identities */
    posture_ids?: string[] | null;

    /** Captured effective-at time (never wall-clock `now()` on replay) */
    effective_at?: utcDateTime | null;
  }

  // ========================================================================
  // Execution authority (W1.01)
  // ========================================================================

  /** One authorized attempt. Nullable only pre-execution. */
  model ExecutionAuthority {
    @format("uuid")
    lease_id?: string | null;

    @format("uuid")
    grant_id?: string | null;

    @format("uuid")
    attempt_id?: string | null;
  }

  // ========================================================================
  // Inputs — exact facts evaluated (W1.01)
  // ========================================================================

  /** Input snapshot identity — the exact facts evaluated by SOL. */
  model InputSnapshot {
    @format("uuid")
    input_snapshot_id: string;

    input_captured_at: utcDateTime;

    /** `sha256:<64 hex>` of the captured input snapshot */
    input_fingerprint: string;
  }

  // ========================================================================
  // Evaluation — assessment (W1.01; NEVER authority-bearing)
  // ========================================================================

  /** Per-proposition evaluation result. */
  model AssertionResult {
    @format("uuid")
    proposition_id: string;
    result: boolean;
    /** Optional evaluator detail line */
    detail?: string | null;
  }

  /**
   * SOL assessment output. Assessment fields are NOT authority-bearing — only
   * the PEB-appended AdmissionReceipt can grant authority (W1.01/W1.03).
   */
  model GovernanceEvaluation {
    assertion_results: AssertionResult[];

    disposition: EnvelopeDisposition;

    /** Unknown/uncertainty markers (e.g. `context:unknown-vocabulary`) */
    unknowns: string[];

    /** Canonical form may carry explicit null when not applicable (W1.04 §2.1) */
    refusal_code?: RefusalCode | null;

    /** Ordered diagnostics — evaluation order is part of the explanation */
    diagnostics?: string[] | null;

    /** Captured evaluation time — replay never substitutes wall-clock now() */
    evaluated_at: utcDateTime;
  }

  // ========================================================================
  // Evidence (W1.01)
  // ========================================================================

  /** Evidence verification set — identities + fingerprint, never payloads. */
  model EvidenceBundle {
    /** UUID identities */
    evidence_ids: string[];

    /** `sha256:<hex>` over the referenced evidence set */
    evidence_fingerprint?: string | null;
  }

  // ========================================================================
  // Fingerprint (W1.04 ratified)
  // ========================================================================

  /** Evaluation fingerprint — required and immutable (W1.04). */
  model EvaluationFingerprint {
    /** `sha256:<64 hex>` over the canonical envelope (W1.04 §3) */
    evaluation_fingerprint: string;

    /** Algorithm — `sha256` (v1) */
    fingerprint_algorithm: string;

    /** Fingerprint algorithm version (1) */
    fingerprint_version: int32;
  }

  // ========================================================================
  // Authority receipt — appended only by PEB after admission (W1.01)
  // ========================================================================

  /**
   * Authority-bearing receipt. Read-only in this contract: PEB appends these
   * fields after admission; no caller may populate them in a request.
   */
  model AdmissionReceipt {
    @format("uuid")
    peb_transaction_id: string;

    @format("uuid")
    admission_receipt_id: string;

    @format("uuid")
    sanctioned_transition_id?: string | null;

    authority_result: AdmissionAuthorityResult;
  }

  // ========================================================================
  // The envelope — the replay authority (W1.01/W1.04)
  // ========================================================================

  /**
   * Canonical governance admission envelope. Immutable, versioned admission/
   * evaluation record and replay authority — not merely correlation metadata.
   *
   * `authority` is appended only by PEB after admission; corrections create a
   * new linked envelope, never a mutation.
   */
  model GovernanceEnvelope {
    /** Envelope schema version — independent of contract_version (AC2) */
    envelope_version: int32;

    @format("uuid")
    envelope_id: string;

    created_at: utcDateTime;

    contract: GovernanceContract;

    semantic: SemanticIdentity;

    workflow: WorkflowContext;

    law: LawSnapshot;

    /** Nullable only pre-execution */
    execution?: ExecutionAuthority | null;

    inputs: InputSnapshot;

    evaluation: GovernanceEvaluation;

    /** Required when claims rely on evidence */
    evidence?: EvidenceBundle | null;

    fingerprint: EvaluationFingerprint;

    /** Appended only by PEB after admission */
    authority?: AdmissionReceipt | null;
  }

  // ========================================================================
  // Request / result / receipt shapes (AC1)
  // ========================================================================

  /** Admission request — the envelope to be evaluated. */
  model AdmissionRequest {
    envelope: GovernanceEnvelope;
  }

  /**
   * Admission result — the assessment + fingerprint. `receipt` is populated
   * only after PEB admission; until then it is absent.
   */
  model AdmissionResult {
    @format("uuid")
    envelope_id: string;

    disposition: EnvelopeDisposition;

    refusal_code?: RefusalCode | null;

    /** `sha256:<64 hex>` — must match the envelope fingerprint (W1.04) */
    evaluation_fingerprint: string;

    /** PEB-appended authority receipt, when admission completed */
    receipt?: AdmissionReceipt | null;
  }
}
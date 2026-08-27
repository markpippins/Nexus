// Package validation — W1.07 schema layer.
//
// Typed mirror of the ratified governance admission envelope wire boundary
// (W1.05 TypeSpec contract in ../spring/, W1.01 field contract, W1.04
// canonical serialization). Field presence/format only — these mirrors make
// malformed artifacts fail CLOSED before any cross-artifact reasoning runs,
// so cross-artifact checks below never observe partially-formed subjects.
//
// This layer does NOT duplicate TypeSpec's payload contract deeper than
// structure: enum/digest/timestamp/IRI shapes come straight from models.tsp
// and W1.06 (absolute IRIs, lowercase RFC3339 UTC, UUID-or-opaque ids).
//
// SCOPE (W1.07 acceptance criterion 4): CUE is explicitly NON-authoritative
// for live lease state, doctrine authorship, SOL evaluation, and Conduit
// mutation. Nothing here grants authority, mints receipts, or stores doctrine.
package validation

// Enforce-on-presence policy block (AC4) — the runner asserts these values
// verbatim before evaluating anything else.
policy_non_authority: {
	live_lease_state:  false
	doctrine_authorship: false
	sol_evaluation:    false
	conduit_mutation:  false
	note:              "CUE validates cross-artifact consistency at build/publication time only."
}

// ---------------------------------------------------------------------------
// identity primitives
// ---------------------------------------------------------------------------

#sha256Hex:    string & =~#"^[0-9a-f]{64}$"#
#sha256Digest: string & =~#"^sha256:[0-9a-f]{64}$"#

// Canonical form is lowercase 8-4-4-4-12 (W1.04).
#uuid: string & =~ #"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"#

// Identifier fields (W1.01/W1.04): canonical lowercase UUID *or* an opaque
// identifier. The runtime canonicalizer (norm_uuid) deliberately passes
// opaque ids through, and W1.05's generated OpenAPI does not hard-enforce
// `format: uuid` — so strict UUID shape here would duplicate TypeSpec field
// validation AND reject ratified golden fixtures (e.g. projection_id
// "p-001"). Shape fidelity stays with TypeSpec; CUE only requires presence.
#identifier: string & != ""

// RFC3339 UTC with Z and six fractional digits (W1.04 canonical form).
#rfc3339UTC: string & =~ #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$"#

// Absolute IRIs only; relative fails closed (W1.06 identity strategy).
#absoluteIRI: string & =~ #"^(http|https|urn|uuid):"#

// ---------------------------------------------------------------------------
// Dispositions / refusal vocabulary (exact enums from models.tsp)
// ---------------------------------------------------------------------------

#Disposition: "allow" | "reject" | "refuse" | "unknown"

#RefusalCode:
	"missing_identity" |
	"missing_digest" |
	"missing_law" |
	"missing_input" |
	"missing_fingerprint" |
	"stale_doctrine" |
	"contract_digest_mismatch" |
	"unknown_context" |
	"expired_lease" |
	"attempt_mismatch" |
	"evaluator_uncertainty" |
	"duplicate_reuse"

#AdmissionAuthorityResult: "granted" | "refused" | "routed"

// ---------------------------------------------------------------------------
// contract + projection identity (the evaluated surface itself)
// ---------------------------------------------------------------------------

#GovernanceContractIdentity: {
	contract_id: #identifier
	// Independent of envelope_version (AC2, W1.01)
	contract_version: int & >0
	contract_digest:  #sha256Digest

	projection_id?:      #identifier
	projection_version?: int & >0
	projection_digest?:  #sha256Digest

	// Operation label must resolve to a published TypeSpec operation
	operation: string & != ""

	transition?: string | null
}

// Semantic identity (JSON-LD subject binding)
#SemanticIdentity: {
	"@context": #absoluteIRI

	subject_id: string & != ""
	subject_type: string & != ""
	subject_ref?: #absoluteIRI | null
}

// Workflow position (where in the process the decision fires)
#WorkflowPosition: {
	workflow_id: string & != ""
	workflow_version: int & >0
	node_id: string & != ""

	work_request_id?:      string | null
	work_request_version?: int | null
}

// Resolved law snapshot passed to SOL
#FrameValue: {
	frame: string & != ""
	// Scalar payload only — structs here would make derived-string checks bottom.
	value: string | number | bool
}

#LawSnapshot: {
	proposition_ids: [...#identifier]
	frame_values: [...#FrameValue]
	doctrine_ids: [...#identifier]
	posture_ids?: [...#identifier] | null
	effective_at?: #rfc3339UTC | null
}

// Execution authority slot (all-or-nothing; optional pre-execution)
#ExecutionSlot: {
	lease_id?: #identifier
	grant_id?: #identifier
	attempt_id?: #identifier
}

// Input snapshot commitment
#InputCommitment: {
	input_snapshot_id: #identifier
	input_captured_at: #rfc3339UTC
	input_fingerprint: #sha256Digest
}

// Per-proposition assessment row
#PropositionAssessment: {
	proposition_id: #identifier
	result:         bool
	detail?:        string | null
}

#GovernanceAssessment: {
	assertion_results: [...#PropositionAssessment]
	disposition:       #Disposition
	unknowns:          [...string]
	refusal_code?:     #RefusalCode | null
	evaluated_at:      #rfc3339UTC
}

#EvidenceCommitment: {
	evidence_ids: [...#identifier]
	evidence_fingerprint?: #sha256Digest | null
}

#FingerprintStatement: {
	evaluation_fingerprint: #sha256Digest
	fingerprint_algorithm:  "sha256"
	fingerprint_version:    1
}

// PEB-appended receipt — read-only in this contract
#AdmissionReceiptRecord: {
	peb_transaction_id: #identifier
	admission_receipt_id: #identifier
	sanctioned_transition_id?: #identifier
	authority_result: #AdmissionAuthorityResult
}

// ---------------------------------------------------------------------------
// the full envelope (closed)
// ---------------------------------------------------------------------------

#GovernanceEnvelopeCUE: {
	envelope_version: int & >0
	envelope_id:      #identifier
	created_at:       #rfc3339UTC

	contract: #GovernanceContractIdentity
	semantic: #SemanticIdentity
	workflow: #WorkflowPosition
	law:      #LawSnapshot

	execution?: #ExecutionSlot | null
	inputs:     #InputCommitment

	evaluation: #GovernanceAssessment

	evidence?:  #EvidenceCommitment | null
	fingerprint: #FingerprintStatement

	authority?: #AdmissionReceiptRecord | null
}

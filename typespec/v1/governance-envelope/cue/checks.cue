package validation

// Cross-artifact consistency rules (W1.07). All logic is real, evaluable
// CUE: every rule resolves to a boolean or a diagnostic list; a failure
// surfaces as a deterministic false leaf / nonempty violation list (AC3:
// diagnostics carry artifact pointers next to the violated fact).
//
// Rule -> diagnostic code map:
//   check.operation_existence                       OPENAPI-OPERATION-NOT-FOUND
//   check.wind_node_reference                       WIND-NODE-REF-DANGLING
//   check.protocol_refs                             DOCTRINE-REF-UNKNOWN-{PROPOSITION,POSTURE}
//   check.jsonld_identity                           CONTEXT-IRI-VIOLATION
//   check.generated_artifacts_pinned                DIGEST-MISMATCH
//   check.endpoint_environment_consistency          ENV-CONTRADICTION
//   check.contract_and_projection_digest_alignment  DIGEST-MISMATCH /
//                                                   CONTRACT-VERSION-MISMATCH
//   check.envelope_self_consistency                 INVALID-DISPOSITION-INVARIANT
//   check.non_authority_boundary                    AC4 scope statement

import (
	"list"
	"strings"
)

// ---------------------------------------------------------------------------
// aliases
// ---------------------------------------------------------------------------

_env:        environment
_law:        law_under_evaluation

// The endpoint registered under the bundle consumer's own logical name,
// located by scan so a missing registration stays a false boolean.
_advertised: [for name, a in _env.endpoints if name == _env.contract_logical_name {a}]

// ---------------------------------------------------------------------------
// derived pools (all total: scans over typed lists, never keyed lookups)
// ---------------------------------------------------------------------------

// Every proposition identity the envelope commits to: declared in the law
// snapshot plus asserted in assessment rows.
_rowPropIds: [for r in envelope.evaluation.assertion_results {r.proposition_id}]
_allProps:   list.Concat([_law.proposition_ids, _rowPropIds])

_unknownProps:    [for p in _allProps       if !list.Contains(ratifiedDoctrinePropositionIDRegistry, p) {p}]
_unknownPostures: [for q in _law.posture_ids if !list.Contains(ratifiedPostureIdentityRegistry, q)      {q}]

// Assessment rows whose proposition was never declared in the law snapshot.
_rowsMissingDeclaration: [
	for p in _rowPropIds if !list.Contains(_law.proposition_ids, p) {p}
]

// Duplicate assertion rows (same proposition assessed more than once).
_duplicateRowIds: [
	for p in _rowPropIds
	if len([for q in _rowPropIds if q == p {q}]) > 1 {p}
]

// Rows not true while disposition claims "allow".
_allowRowsNotTrue: [
	for r in envelope.evaluation.assertion_results
	if envelope.evaluation.disposition == "allow" && !r.result {r.proposition_id}
]

// Contract-version cap row for the bundle consumer's logical name.
_capForLogicalName: [
	for name, c in governanceVersionCapRegistry
	if name == _env.contract_logical_name {c}
]
_capPresent: len(_capForLogicalName) == 1

// Operation / Wind-node registry hits, again via scan for totality.
_opMatches: [
	for name, op in typeSpecOperationPathTable
	if name == envelope.contract.operation {op}
]
_nodeMatches: [
	for name, n in windWorkflowNodeProjectionRegistry
	if name == envelope.workflow.node_id {n}
]

// Artifact digest slots disagreeing with the live working tree.
_digestSlotMismatches: [
	for s in _env.digest_probes
	if s.recorded_sha256_hex != s.live_sha256_hex {s.slot_name}
]

// Generated-artifact slots pinned by the OpenAPI conformance manifest
// (artifact-hashes.json) specifically.
_openapiManifestSlotsInconsistent: [
	for s in _env.digest_probes
	if s.manifest_key == "openapi.yaml" && s.recorded_sha256_hex != s.live_sha256_hex {s.slot_name}
]

// Subject-reference IRIs violating absoluteness (W1.06 decision #1).
_subjectRefViolations: [
	for ref in normalized_identity.subject_refs
	if !(strings.HasPrefix(ref, "https://") || strings.HasPrefix(ref, "http://") ||
		strings.HasPrefix(ref, "urn:") || strings.HasPrefix(ref, "uuid:")) {ref}
]

// Endpoint registrations whose mode leaves the governed vocabulary
// (matches the `environment` frame value domain used by envelopes).
_badEndpointModes: [
	for _, a in _env.endpoints
	if a.mode != "production" && a.mode != "staging" && a.mode != "dev" {a.mode}
]

// Endpoint URLs whose path does not end in "/<own logical name>".
_urlPathViolations: [
	for name, a in _env.endpoints
	if !strings.HasSuffix(a.url, "/\(name)") {name}
]

// Environment frame values contradicting the advertised endpoint mode.
// Single flat comprehension over the product — never list-of-lists.
_envModeConflicts: [
	for f in envelope.law.frame_values
	if f.frame == "environment"
	for a in _advertised
	if "\(f.value)" != a.mode
	{"\(f.value)"}
]

check: {
	// -------------------------------------------------------------------------
	// 2. operation existence
	// -------------------------------------------------------------------------
	operation_existence: {
		requested_operation: envelope.contract.operation
		operation_known:     len(_opMatches) == 1
		resolved_path:       [for o in _opMatches {o.path}]
		type_spec_pointer:   "\(_env.type_spec_sources_root)/governance-envelope/spring/operations.tsp"
		envelope_pointer:    "envelope.contract.operation"
	}

	// -------------------------------------------------------------------------
	// 3. Wind node references
	// -------------------------------------------------------------------------
	wind_node_reference: {
		referenced_node_id: envelope.workflow.node_id
		node_in_registry:   len(_nodeMatches) == 1
		node_belongs_to_declared_workflow: len([
			for n in _nodeMatches
			if n.workflow == envelope.workflow.workflow_id {n}
		]) == 1
		node_registry_pointer: _env.wind_projection_registry_file
		workflow_pointer:      "envelope.workflow.workflow_id"
	}

	// -------------------------------------------------------------------------
	// 4. proposition/posture references resolvable against the ratified corpus
	// -------------------------------------------------------------------------
	protocol_refs: {
		doctrine_corpus_pointer: _env.doctrine_corpus_file
		dangling_proposition_refs: _unknownProps
		dangling_posture_refs:     _unknownPostures
		all_refs_resolvable: len(_unknownProps) == 0 && len(_unknownPostures) == 0
		assertion_rows_all_declared: len(_rowsMissingDeclaration) == 0
		rows_missing_declaration:    _rowsMissingDeclaration
		no_duplicate_assertion_rows: len(_duplicateRowIds) == 0
		duplicate_row_ids:           _duplicateRowIds
		registry_scope_note: "identity-only index; law content remains with PEB/resolution (no second doctrine store)"
	}

	// -------------------------------------------------------------------------
	// 5. JSON-LD identity (W1.06)
	// -------------------------------------------------------------------------
	jsonld_identity: {
		// Scheme+host are case-insensitive per RFC 3986 6.2.2 (the canonicalizer
		// lowercases them; path case is significant). Compare case-folded.
		context_under_canonical_base: strings.HasPrefix(
			strings.ToLower(normalized_identity.context_iri),
			strings.ToLower(_env.jsonld_context_base_iri))
		required_canonical_base: _env.jsonld_context_base_iri
		subject_refs_absolute:   len(_subjectRefViolations) == 0
		subject_ref_violations:  _subjectRefViolations
		w1_06_mapping_pointer:   "W1.06 deliverable - Canonical identity strategy"
	}

	// -------------------------------------------------------------------------
	// 6a. generated artifact digests pinned against conformance manifests
	// -------------------------------------------------------------------------
	generated_artifacts_pinned: {
		pinned_slots_match_live_bytes: len(_digestSlotMismatches) == 0
		mismatched_slots:              _digestSlotMismatches
		openapi_conformance_manifest_intact: len(_openapiManifestSlotsInconsistent) == 0
		probe_count:                   len(_env.digest_probes)
		conformance_pointer:           "../conformance/artifact-hashes.json"
		live_tree_pointer:             "nexus/typespec/v1/governance-envelope/**"
	}

	// -------------------------------------------------------------------------
	// 7. contract/version/digest alignment (projection publication gate)
	// -------------------------------------------------------------------------
	contract_and_projection_digest_alignment: {
		version_cap_registered: _capPresent
		version_not_beyond_published_cap: len([
			for c in _capForLogicalName
			if c.latest_published_version >= _env.contract_version_recorded_in_manifest &&
				c.latest_published_version >= envelope.contract.contract_version {c}
		]) == 1
		published_versions_observed: [
			for c in _capForLogicalName {c.latest_published_version}
		]
		all_recorded_digests_align: len(_digestSlotMismatches) == 0
		consumer_logical_name:      _env.contract_logical_name
	}

	// -------------------------------------------------------------------------
	// 6b. environment endpoint identity
	// -------------------------------------------------------------------------
	endpoint_environment_consistency: {
		endpoint_declared_for_contract: len(_advertised) == 1
		endpoint_mode_vocabulary_ok:    len(_badEndpointModes) == 0
		url_path_matches_contract_name: len(_urlPathViolations) == 0
		mode_consistent_with_env_frames: len(_envModeConflicts) == 0
		environment_frame_conflicts:    _envModeConflicts
		logical_name:                   _env.contract_logical_name
		frame_source_pointer:           "envelope.law.frame_values[frame=\"environment\"]"
	}

	// -------------------------------------------------------------------------
	// envelope self-consistency beyond field shapes
	// -------------------------------------------------------------------------
	envelope_self_consistency: {
		refusal_shape_consistent:
			(envelope.evaluation.disposition != "allow") ||
				(envelope.evaluation.refusal_code == null)
		allow_implies_all_assertions_true: len(_allowRowsNotTrue) == 0
		not_true_rows_under_allow:         _allowRowsNotTrue
		evaluation_pointer:                "envelope.evaluation.*"
	}

	// -------------------------------------------------------------------------
	// AC4 scope statement surfaced through CUE itself (runner also asserts it)
	// -------------------------------------------------------------------------
	non_authority_boundary: {
		live_lease_state_non_authoritative:  policy_non_authority.live_lease_state == false
		doctrine_authorship_non_authoritative: policy_non_authority.doctrine_authorship == false
		sol_evaluation_non_authoritative:    policy_non_authority.sol_evaluation == false
		conduit_mutation_non_authoritative:  policy_non_authority.conduit_mutation == false
		boundary_reference:                  "W1.07 acceptance criterion 4"
	}
}

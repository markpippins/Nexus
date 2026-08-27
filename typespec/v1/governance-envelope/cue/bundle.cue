package validation

// W1.07 cross-artifact consistency bundle.
//
// Validates BEFORE a workflow/service projection publishes:
//   1. contract/version/digest alignment        (CONTRACT-VERSION-MISMATCH)
//   2. operation existence                      (OPENAPI-OPERATION-NOT-FOUND)
//   3. Wind node references                     (WIND-NODE-REF-DANGLING)
//   4. proposition/posture references           (DOCTRINE-REF-UNKNOWN)
//   5. JSON-LD identity                         (CONTEXT-IRI-VIOLATION)
//   6. generated artifact digests               (DIGEST-MISMATCH)
//   7. environment endpoint identity            (ENV-CONTRADICTION)
//
// NON-AUTHORITY BOUNDARY (AC4): CUE validates static cross-artifact
// consistency only. It is explicitly non-authoritative for live lease state,
// doctrine authorship, SOL evaluation, and Conduit mutation - see
// policy_non_authority in schema.cue and check.non_authority_boundary below.

// ---------------------------------------------------------------------------
// Required caller-provided inputs (fail closed when absent)
// ---------------------------------------------------------------------------

// Wire-form-validated admission envelope (schema.cue applies transitively).
envelope!: #GovernanceEnvelopeCUE

// Law snapshot under evaluation (same content as envelope.law normally;
// mirrored separately so the bundle stays meaningful when the caller
// evaluates contract/projection alignment outside a full admission run).
law_under_evaluation!: #LawSnapshot

// Runner-composed string views of envelope semantic identity (null-erased
// normalization only - the runner never decides validity, CUE does).
normalized_identity!: {
	context_iri!:  string
	subject_refs!: [...string]
}

// Environment the projection targets - must agree with envelope frame_values.
environment!: {
	contract_logical_name!:                 string
	contract_version_recorded_in_manifest!: int & >0

	// Provenance/documentation pointers surfaced verbatim in diagnostics (AC3):
	type_spec_sources_root!:        string
	wind_projection_registry_file!: string
	doctrine_corpus_file!:          string
	endpoints_manifest_file!:       string

	// Canonical JSON-LD @context base. W1.06 prescribes ONE canonical context
	// identity; every endpoint IRI must prefix-match it after RFC3986-ish
	// normalization done upstream.
	jsonld_context_base_iri!: #absoluteIRI

	endpoints!: [string]: {
		url!:  string & =~#"^(https?)://"#
		mode!: string
	}

	digest_probes!: [...#GeneratedArtifactDigestProbe]
}

// A pinned digested-artifact slot. live_* is computed by the runner against
// the working tree; recorded_* is read from the recorded conformance manifest.
#GeneratedArtifactDigestProbe: {
	slot_name!:           string
	manifest_file!:       string
	manifest_key!:        string
	live_file?:           string
	live_sha256_hex!:     #sha256Hex // runner-computed against working tree
	recorded_sha256_hex!: #sha256Hex // runner-read from conformance manifest
	expect_matches:       true
}

// ---------------------------------------------------------------------------
// Registries — build-time knowledge CUE may consult (NOT a doctrine store:
// holds UUID identities and published-surface facts only; law content stays
// with PEB/resolution per AC4 and the "no second doctrine store" boundary).
// Fixtures/environments complete or override these via ordinary unification.
// ---------------------------------------------------------------------------

// Published TypeSpec operations for the governance admission surface
// (source: spring/operations.tsp).
typeSpecOperationPathTable: [string]: close({
	path!:   string & =~#"^/"#
	method!: "GET" | "POST" | "PUT" | "DELETE"
})

// Wind process graph nodes eligible as governance decision points
// (source: Wind ratified WR series). Identity-only: id + owning workflow.
windWorkflowNodeProjectionRegistry: [string]: close({
	id!:         string
	workflow!:   string
	node_kind!:  "decision" | "process"
})

// Ratified doctrine corpus INDEX (UUID identities only, no law payload).
// Provided per run - the bundle never invents registry membership.
ratifiedDoctrinePropositionIDRegistry!: [...string]

// Ratified posture identities (UUID identities only).
ratifiedPostureIdentityRegistry!: [...string]

// Highest contract version published per logical contract artifact.
governanceVersionCapRegistry: [string]: close({
	latest_published_version!: int & >0
})

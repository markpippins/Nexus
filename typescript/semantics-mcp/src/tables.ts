/**
 * tables.ts — registry of the 12 semantics.* tables after convergence to the
 *   standalone sol.semantics shape (2026-09-01, record f3320458).
 * Kept in sync with semantics-srv/src/tables.ts (each package is self-contained).
 *
 * Removed (retired — owned by resolution.* as the evaluation model):
 *   owning_subsystem, concept, concept_relationship, representation,
 *   representation_identity, representation_relationship, identity_strategy,
 *   consumer_operation, execution_claim.
 * Retained pending the canonical_asset ownership decision (handoff 5e2884db).
 *
 * `writable` = column names accepted as p_* params by the add_/update_ procs,
 * in proc parameter order.
 */

export interface TableMeta {
  table: string;
  label: string;
  idType: "uuid" | "smallint";
  idAuto: boolean;
  smallintCols: string[];
  jsonbCols: string[];
  writable: string[];
  required: string[];
  note?: string;
  /** Column used for single-row lookups (default "id"); relationship_type uses "name". */
  idCol?: string;
  /** Proc param name for the id (default "p_id"); relationship_type uses "p_name". */
  idParam?: string;
}

export const TABLES: TableMeta[] = [
  {
    table: "relationship_type",
    label: "relationship type (vocabulary of legal edge types)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: ["name", "description", "scope", "notes", "expired_at"],
    required: ["name", "description"],
    idCol: "name",
    idParam: "p_name",
    note: "Vocabulary table — FK-referenced by concept_relationship / representation_relationship (only defined types are legal edges). update takes p_new_name (names are never reused).",
  },
  {
    table: "evidence_type",
    label: "evidence type (vocabulary of evidence kinds)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: ["name", "description", "origin_category", "notes", "expired_at"],
    required: ["name", "description"],
    idCol: "name",
    idParam: "p_name",
    note: "Vocabulary table — FK-referenced by evidence_item. update takes p_new_name.",
  },
  {
    table: "evidence_item",
    label: "evidence item (immutable, hash-deduplicated evidence record)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: ["metadata"],
    writable: ["evidence_type_id", "uri", "excerpt", "note", "origin", "captured_at", "source_hash", "metadata", "valid_from", "valid_to", "expired_at"],
    required: ["evidence_type_id"],
    note: "Immutable after creation (no update_ proc). Soft-close via soft_delete_. Dedup on (evidence_type_id, source_hash).",
  },
  {
    table: "statement_evidence",
    label: "statement evidence (evidence linked to a relationship claim)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: ["evidence_item_id", "statement_type", "statement_id", "role", "strength", "comment", "expired_at"],
    required: ["evidence_item_id", "statement_type", "statement_id", "role"],
    note: "Polymorphic junction — statement_type includes source_observation, concept_relationship, representation_relationship, execution_claim, resolution_proposition (sol vocabulary). Unique on (evidence_item_id, statement_type, statement_id, role).",
  },
  {
    table: "snapshot",
    label: "snapshot (per-baseline judgment record)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: ["label", "version", "parent_id", "status", "created_by", "notes", "expired_at"],
    required: ["label", "version", "created_by"],
  },
  {
    table: "snapshot_observation",
    label: "snapshot observation (per-baseline judgment on a representation)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: [
      "snapshot_id",
      "representation_id",
      "lifecycle_state",
      "is_completed_fix",
      "completed_fix_ref",
      "audit_reason",
      "safe_to_retire",
      "expired_at",
    ],
    required: ["snapshot_id", "representation_id", "lifecycle_state"],
    note: "representation_id column retained (matches sol.semantics) but its FK to semantics.representation is dropped under convergence — the id is historical.",
  },
  {
    table: "drift_finding",
    label: "drift finding (finding against a snapshot observation)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: ["observation_id", "description", "severity", "resolved_at", "expired_at"],
    required: ["observation_id", "description", "severity"],
    note: "Lifecycle: detected (resolved_at NULL) → resolved via semantics_resolve_drift_finding.",
  },
  {
    table: "canonical_asset",
    label: "canonical asset (enduring identity record: asset:<platform>:<ns>:<key>)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: ["canonical_key"],
    writable: [
      "canonical_asset_id",
      "asset_kind",
      "canonical_key",
      "source_hash",
      "content_hash",
      "validity_start",
      "validity_end",
      "expired_at",
    ],
    required: ["canonical_asset_id", "asset_kind"],
    note: "T02 Phase 1. canonical_asset_id is the durable business key (compound asset:<platform>:<ns>:<key>); partial unique index on active rows. revisions/claims/relations hang off it. Retained pending the asset-ownership decision (handoff 5e2884db); do not remove without that decision.",
  },
  {
    table: "asset_revision",
    label: "asset revision (immutable append-only revision of a canonical asset)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: [
      "revision_id",
      "asset_id",
      "content_hash",
      "source_hash",
      "parent_revision_id",
      "recording_start",
      "recording_end",
      "created_by",
      "expired_at",
    ],
    required: ["revision_id", "asset_id"],
    note: "T02 Phase 1. Same content_hash → same revision (idempotent, invariant #2); different content_hash → NEW revision of the same asset, NOT a new asset.",
  },
  {
    table: "source_observation",
    label: "source observation (provenance: what was observed and from where)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: [
      "revision_id",
      "platform",
      "platform_identifier",
      "namespace",
      "raw_location",
      "observed_at",
      "ingestion_run_id",
      "raw_hash",
      "expired_at",
    ],
    required: ["revision_id", "platform"],
    note: "T02 Phase 1. No created_at — observations are provenance rows (matches snapshot_observation convention).",
  },
  {
    table: "asset_identity_claim",
    label: "asset identity claim (proposed identity linkage with confidence)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: [
      "asset_id",
      "candidate_asset_id",
      "claim_type",
      "confidence",
      "basis",
      "status",
      "decided_by",
      "decided_at",
      "expired_at",
    ],
    required: ["asset_id", "claim_type", "status"],
    note: "T02 Phase 2. claim_type ∈ identity|supersession|derivation|consolidation|split; status lifecycle open→resolved/rejected; basis ∈ strong|medium|weak. INVARIANT: claim never performs the merge — only owning-role decision resolves it.",
  },
  {
    table: "asset_relation",
    label: "asset relation (directed edge: supersedes / derives_from / contradicts / consolidates_into / split_from)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: [
      "from_asset_id",
      "to_asset_id",
      "relation_type",
      "decided_by",
      "decided_at",
      "effective_at",
      "expired_at",
    ],
    required: ["from_asset_id", "to_asset_id", "relation_type"],
    note: "T02 Phase 2. Self-loops forbidden (from_asset_id <> to_asset_id). Append-only with expired_at soft-delete; active edge uniqueness on (from, to, type).",
  },
];

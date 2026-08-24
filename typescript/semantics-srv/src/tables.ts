/**
 * tables.ts — registry of the 21 semantics.* tables
 *   (V057 design model + V060 relationship vocabulary + V065 T02 Phase 1
 *    asset spine + V066 T02 Phase 2 relationship layer).
 *
 * The stored-procedure write surface is generated from this registry:
 *   add_<table>(p_id?, p_<writable>...)           INSERT ... RETURNING *
 *   update_<table>(p_id, p_<writable>...)          append-only replace (expire + insert new version)
 *   soft_delete_<table>(p_id) -> integer           expire-not-delete (idempotent)
 *   resolve_drift_finding(p_id, p_resolved_at)     drift lifecycle (drift_finding only)
 *
 * `writable` = column names accepted as p_* params by the add_/update_ procs,
 * in proc parameter order (auto columns like created_at / effective_at /
 * detected_at are not writable — the DB fills them).
 */

export interface TableMeta {
  /** Table name — also the REST path segment and the MCP tool suffix. */
  table: string;
  /** Human-readable label. */
  label: string;
  /** Primary key type. */
  idType: "uuid" | "smallint";
  /** true when the add_ proc auto-generates the id (uuid); false → caller must supply it. */
  idAuto: boolean;
  /** Columns that must be coerced to numeric (smallint). */
  smallintCols: string[];
  /** Columns that are jsonb. */
  jsonbCols: string[];
  /** Writable columns (p_* params), in proc parameter order. */
  writable: string[];
  /** NOT NULL columns (enforced by the DB; informational here). */
  required: string[];
  /** Extra note surfaced in tool descriptions. */
  note?: string;
  /** Column used for single-row lookups (default "id"); relationship_type uses "name". */
  idCol?: string;
  /** Proc param name for the id (default "p_id"); relationship_type uses "p_name". */
  idParam?: string;
}

export const TABLES: TableMeta[] = [
  {
    table: "owning_subsystem",
    label: "owning subsystem (fleet)",
    idType: "smallint",
    idAuto: false,
    smallintCols: ["id"],
    jsonbCols: [],
    writable: ["name", "description", "path", "expired_at"],
    required: ["id", "name"],
    note: "Stable smallint lookup key — id is caller-supplied; update requires p_new_id.",
  },
  {
    table: "concept",
    label: "concept (class)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: ["name", "description", "expired_at"],
    required: ["name"],
  },
  {
    table: "representation",
    label: "representation (physical form of a concept)",
    idType: "uuid",
    idAuto: true,
    smallintCols: ["owning_subsystem_id"],
    jsonbCols: ["raw_metadata"],
    writable: [
      "concept_id",
      "label",
      "schema_name",
      "table_name",
      "owning_subsystem_id",
      "owner",
      "raw_metadata",
      "expired_at",
    ],
    required: ["concept_id", "label", "owning_subsystem_id"],
  },
  {
    table: "representation_relationship",
    label: "representation relationship (fidelity/lineage between forms)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: [
      "from_representation_id",
      "to_representation_id",
      "relationship_type",
      "notes",
      "expired_at",
    ],
    required: ["from_representation_id", "to_representation_id", "relationship_type"],
    note: "Evidence is now modelled as first-class evidence_item + statement_evidence (V072); provenance query joins through statement_evidence.",
  },
  {
    table: "consumer_operation",
    label: "consumer operation (who touches a representation and how)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: ["representation_id", "consumer_name", "operation", "notes", "expired_at"],
    required: ["representation_id", "consumer_name", "operation"],
  },
  {
    table: "identity_strategy",
    label: "identity strategy (what identity means for a concept)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: ["concept_id", "canonical_key_description", "notes", "expired_at"],
    required: ["concept_id", "canonical_key_description"],
  },
  {
    table: "representation_identity",
    label: "representation identity (how a form expresses its concept's identity)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: [
      "representation_id",
      "identity_strategy_id",
      "identity_expression",
      "notes",
      "expired_at",
    ],
    required: ["representation_id", "identity_strategy_id", "identity_expression"],
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
    table: "concept_relationship",
    label: "concept relationship (legal pipeline shape between classes)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: [],
    writable: [
      "from_concept_id",
      "to_concept_id",
      "relationship_type",
      "path",
      "notes",
      "expired_at",
    ],
    required: ["from_concept_id", "to_concept_id", "relationship_type"],
    note: "path is 'green' | 'red' | null (branch tag). Evidence is now first-class via evidence_item + statement_evidence (V072).",
  },
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
  // ── V065: T02 Phase 1 — canonical asset identity spine ──────────────
  // canonical_asset / asset_revision / source_observation. Append-only /
  // expire-not-delete, partial unique indexes on active rows. Phase 2
  // (asset_identity_claim + asset_relation) lands in a later turn.
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
    note: "T02 Phase 1. canonical_asset_id is the durable business key (compound asset:<platform>:<ns>:<key>); partial unique index on active rows. revisions/claims/relations hang off it.",
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
  // ── V066: T02 Phase 2 — asset relationship layer ────────────────────
  // asset_identity_claim + asset_relation. The claim NEVER performs a
  // merge — resolution requires an owning-role decision (Architect closes
  // spec/plan, Planner closes candidate/question per contract Q4).
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
  // ── V072: Evidence spine ──────────────────────────────────────────
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
    note: "Polymorphic junction — statement_type includes concept_relationship, representation_relationship, and execution_claim. Unique on (evidence_item_id, statement_type, statement_id, role).",
  },
  {
    table: "execution_claim",
    label: "execution claim (semantics projection of a bounded SOL execution claim)",
    idType: "uuid",
    idAuto: true,
    smallintCols: [],
    jsonbCols: ["subject_ref", "object_value", "verification_summary"],
    writable: [
      "resolution_claim_id",
      "claim_key",
      "subject_kind",
      "subject_ref",
      "predicate",
      "object_value",
      "policy_version_hash",
      "lease_id",
      "grant_id",
      "attempt_id",
      "declared_by",
      "declared_at",
      "observed_at",
      "disposition",
      "verification_method",
      "verified_by",
      "verified_at",
      "verification_summary",
      "expired_at",
    ],
    required: ["claim_key", "subject_kind", "predicate", "declared_by"],
    note: "Projection/correlation surface for resolution.execution_claim. It does not issue leases, grant capabilities, authorize execution, or prove kernel materialization; link evidence with statement_type=execution_claim.",
  },
];

export function getTable(name: string): TableMeta | undefined {
  return TABLES.find((t) => t.table === name);
}

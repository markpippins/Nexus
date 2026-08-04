/**
 * tables.ts — registry of the 12 semantics.* tables (V057 design model + V060 relationship vocabulary).
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
      "evidence_source",
      "evidence_type",
      "confidence",
      "evidence_notes",
      "expired_at",
    ],
    required: ["from_representation_id", "to_representation_id", "relationship_type"],
    note: "evidence_source/type + confidence (0..1) + evidence_notes record the provenance backing each edge.",
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
      "evidence_source",
      "evidence_type",
      "confidence",
      "evidence_notes",
      "expired_at",
    ],
    required: ["from_concept_id", "to_concept_id", "relationship_type"],
    note: "path is 'green' | 'red' | null (branch tag); evidence_source/type + confidence (0..1) + evidence_notes record provenance.",
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
];

export function getTable(name: string): TableMeta | undefined {
  return TABLES.find((t) => t.table === name);
}

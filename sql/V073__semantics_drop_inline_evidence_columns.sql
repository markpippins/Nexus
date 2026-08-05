-- ═══════════════════════════════════════════════════════════════════════
--  V073 — semantics: drop inline evidence columns from relationship tables
--
--  evidence_source, evidence_type, evidence_notes, and confidence on
--  concept_relationship and representation_relationship have been
--  migrated to evidence_item + statement_evidence (V072 backfill).
--  The inline columns are now redundant.
--
--  Also drops the confidence CHECK constraints that reference those columns.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── concept_relationship ──────────────────────────────────────────────

ALTER TABLE semantics.concept_relationship
    DROP CONSTRAINT IF EXISTS chk_concept_relationship_confidence;

ALTER TABLE semantics.concept_relationship
    DROP COLUMN IF EXISTS evidence_source,
    DROP COLUMN IF EXISTS evidence_type,
    DROP COLUMN IF EXISTS evidence_notes,
    DROP COLUMN IF EXISTS confidence;

-- ── representation_relationship ───────────────────────────────────────

ALTER TABLE semantics.representation_relationship
    DROP CONSTRAINT IF EXISTS chk_representation_relationship_confidence;

ALTER TABLE semantics.representation_relationship
    DROP COLUMN IF EXISTS evidence_source,
    DROP COLUMN IF EXISTS evidence_type,
    DROP COLUMN IF EXISTS evidence_notes,
    DROP COLUMN IF EXISTS confidence;

COMMIT;

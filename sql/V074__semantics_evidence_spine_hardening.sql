-- ═══════════════════════════════════════════════════════════════════════
--  V074 — semantics: evidence spine hardening (T04 3B)
--
--  Purpose: Harden the V072 evidence spine per architect decision
--  thread `evidence-design` (T04 3B):
--    1. verification_state lifecycle extended with `superseded`
--       (claim-level state; statements keep per-row `strength`)
--    2. dedup key broadened to (evidence_type_id, source_hash,
--       digest(excerpt, 'sha256')) — source_hash is observation-wide,
--       so the old (type, source_hash) pair collapsed distinct claims
--       from the same observation; the partial active-row predicate
--       from the original index is preserved for bitemporal history
--    3. statement_type CHECK widened to 7 values: the 5 new
--       evidence-spine surfaces (source_observation, agent_record,
--       work_request, implementation_plan, harvest_candidate) plus the
--       2 legacy relationship-layer surfaces (representation_relationship,
--       concept_relationship) that the 53 existing rows reference —
--       widen, don't backfill: those rows resolve against live tables
--    4. nullable FK evidence_item.source_observation_id →
--       source_observation(id), anchoring the primary-observer case;
--       statement_evidence stays the polymorphic link for the rest
--
--  Deferred (filed as Assembly to-do fe2d976d): polymorphic resolution
--  trigger for statement_evidence.statement_id.
--
--  Idempotent: safe for Strontium parity re-application.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Part 1: Widen verification_state on evidence_item ──

ALTER TABLE semantics.evidence_item
  DROP CONSTRAINT IF EXISTS evidence_item_verification_state_check;

ALTER TABLE semantics.evidence_item
  ADD CONSTRAINT evidence_item_verification_state_check
    CHECK (verification_state IN ('candidate', 'confirmed', 'contested', 'superseded'));

-- ── Part 2: Dedup key — type + source_hash + excerpt digest ──
-- Preserve the partial WHERE predicate from the original index so
-- bitemporal history can hold multiple versions of the same claim.

DROP INDEX IF EXISTS semantics.idx_evidence_item_active_hash;
DROP INDEX IF EXISTS semantics.idx_evidence_item_active_dedup;

CREATE UNIQUE INDEX idx_evidence_item_active_dedup
  ON semantics.evidence_item (evidence_type_id, source_hash, digest(excerpt, 'sha256'))
  WHERE recorded_until_dt = '9999-12-31 23:59:59+00'::timestamptz
    AND expired_at IS NULL;

-- ── Part 3: statement_type CHECK on statement_evidence ──

ALTER TABLE semantics.statement_evidence
  DROP CONSTRAINT IF EXISTS statement_evidence_type_check;

ALTER TABLE semantics.statement_evidence
  ADD CONSTRAINT statement_evidence_type_check
    CHECK (statement_type IN (
      'source_observation',
      'agent_record',
      'work_request',
      'implementation_plan',
      'harvest_candidate',
      'representation_relationship',
      'concept_relationship'
    ));

-- ── Part 4: Nullable FK evidence_item → source_observation ──
-- Both in semantics.* — safe to FK. Strengthens the primary-observer case.

ALTER TABLE semantics.evidence_item
  ADD COLUMN IF NOT EXISTS source_observation_id uuid
  REFERENCES semantics.source_observation(id);

COMMIT;

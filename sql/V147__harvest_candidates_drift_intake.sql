-- V147 (plan 8261640 / decision 4496df1d) — harvest_candidates drift-intake
-- schema surface.
--
-- Architect ruling R-2026-09-08-02 (GREEN LIGHT, 4 clauses). Conforms:
--   C1 sentinel harvest created idempotently HERE (not lazily in app code),
--      before the first drift candidate insert; migration ordering guarantees it.
--   C2 dedupe unique index is WINDOW-SCOPED (valid_until AND recorded_until_dt
--      both at the live-window sentinel), so a superseded row frees the key and
--      a later re-observation of the same root fact can re-enter the pool.
--   C3 all DDL schema-qualified to nebula.* (scratch.* mirror NOT touched).
--   C4 hc_type_check is the full 7-value array (existing 6 + 'drift').
--
-- Surface facts (verified live, R15):
--   * nebula.harvest_candidates is a VIEW over bitemporal
--     nebula.harvest_candidates_history (recorded_on_dt/recorded_until_dt +
--     valid_from/valid_until; defaults now()/9999-12-31 23:59:59+00).
--   * hc_type_check lives on the HISTORY table (view inherits it).
--   * NO FK on harvest_candidates.harvest_id (harvests is a view); the real
--     contract is NOT NULL — satisfied via the sentinel harvest.
--   * No status CHECK constraint — 'active' is safe for drift rows.
--
-- This is a NEBULA surface, NOT a resolution (Lilac) surface, so it does not
-- conflict with the plan 8261640 "no change to Lilac wave resolution schema
-- surfaces" constraint.
--
-- R9: schema change. MUST be replicated to vanadium (canonical live replica)
-- after apply, per AGENTS.md R9 — confirm with the operator; never assume.

-- ---------------------------------------------------------------------------
-- C1: sentinel harvest ('observations/drift') — idempotent, must precede any
-- drift candidate insert. Created here so no app-code race can duplicate it.
-- ---------------------------------------------------------------------------
INSERT INTO nebula.harvests_history (source_path)
SELECT 'observations/drift'
WHERE NOT EXISTS (SELECT 1 FROM nebula.harvests_history WHERE source_path = 'observations/drift');

-- ---------------------------------------------------------------------------
-- Drift-intake columns on the canonical bitemporal history table.
-- ---------------------------------------------------------------------------
ALTER TABLE nebula.harvest_candidates_history
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS severity_note text,
  ADD COLUMN IF NOT EXISTS completion_reference text;

-- ---------------------------------------------------------------------------
-- Rebuild the live view to expose the 3 new columns (auto-updatable INSERT
-- path preserved — single-table, no aggregate; harvest_id supplied + defaults
-- fill the window, matching the routes.ts:3027 insert pattern).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW nebula.harvest_candidates AS
SELECT id,
       harvest_id,
       title,
       intent_description,
       implementation_notes,
       code_snippets,
       open_questions,
       tags,
       status,
       system_id,
       subsystem_id,
       feature_id,
       valid_from,
       valid_until,
       created_at,
       updated_at,
       work_request_id,
       completed,
       compilation_readiness,
       type,
       design_rationale,
       provenance_block_indices,
       needs_new_node,
       proposed_parent,
       proposed_name,
       placement_reason,
       recorded_on_dt,
       recorded_until_dt,
       asset_id,
       dedupe_key,
       severity_note,
       completion_reference
FROM nebula.harvest_candidates_history
WHERE now() >= recorded_on_dt AND now() < recorded_until_dt
  AND now() >= valid_from AND now() < valid_until;

-- ---------------------------------------------------------------------------
-- C2: window-scoped live-window dedupe uniqueness on the root-fact fingerprint.
-- Allows exactly one LIVE candidate per root fact while keeping history
-- versions (and post-supersede re-entry on re-observation) legal.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS uq_hc_dedupe_live;
CREATE UNIQUE INDEX uq_hc_dedupe_live
  ON nebula.harvest_candidates_history (dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND valid_until = '9999-12-31 23:59:59+00'
    AND recorded_until_dt = '9999-12-31 23:59:59+00';

-- ---------------------------------------------------------------------------
-- C4: extend hc_type_check to admit 'drift' (preserve the existing 6 values).
-- ---------------------------------------------------------------------------
ALTER TABLE nebula.harvest_candidates_history DROP CONSTRAINT IF EXISTS hc_type_check;
ALTER TABLE nebula.harvest_candidates_history ADD CONSTRAINT hc_type_check
  CHECK (type = ANY (ARRAY['requirement','principle','rejected_alternative','tension','rationale','mixed','drift']));
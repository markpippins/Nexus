-- =============================================================================
-- V144 (Lilac Wave 1, plan 8261639 / Stage D): legacy-surface retirement.
-- =============================================================================
-- NUMBERING NOTE (architect review of 2026-09-07, F1 / condition C3): V144
-- was originally referenced as the retirement DDL from V141's header comment.
-- V142 (producer registration) and V143 (Stage B admission index) were
-- subsequently applied/merged in the Stage B/C sequence, so the retirement
-- DDL lands HERE as V144 — consistent with the V141 header note as corrected
-- by commit 0d0c8ce4 ("renumber retirement DDL V142→V144"). Stage D executes
-- ONLY after C1-C3 conditions are discharged and signoffs exist.
--
-- ⚠️  SELF-GATING (the whole point): this migration REFUSES TO APPLY unless
--     resolution.c6_retirement_gate() returns satisfied = true. That gate
--     requires, at execution time:
--       * canonical infra present
--       * vision_receipts_missing_twin = 0      (C4 import completeness)
--       * vision_tickets_undisposed = 0         (C6 ticket dispositions)
--       * vision_tickets_non_closed = 0         (real work drained)
--       * green_soak_days >= 7                  (Q-D soak, C1 provenance)
--       * binding_signoffs >= 2                 (operator + architect, I1)
--     If any condition is unmet, the migration raises errcode 'P1000' and
--     the transaction aborts — no partial state. The gate function reads
--     vision.receipts / vision.tickets via to_regclass, so this migration
--     is applicable inside throwaway test schemas where the legacy
--     surfaces are absent (absent = already retired = conditions pass).
--
-- What retirement means here (conservative, reversible):
--   1. RENAME (not drop): vision.receipts → vision.receipts_retired,
--      vision.tickets → vision.tickets_retired. The legacy surfaces go
--      dark for every consumer using the old names; data is preserved for
--      audit/forensics and for a documented restore path.
--   2. REVOKE write privileges from the writer roles on the renamed tables
--      (defense in depth: even a consumer that still finds the new name
--      cannot write).
--   3. Leaves resolution.* canonical surfaces and the V140 unified
--      projection untouched — they are the surviving read path.
--
-- Reversibility (documented, not automated):
--   ALTER TABLE vision.receipts_retired RENAME TO receipts;
--   ALTER TABLE vision.tickets_retired RENAME TO tickets;
--   GRANT INSERT, UPDATE, DELETE ON vision.receipts, vision.tickets TO <writers>;
--   (No data is destroyed by this migration.)
-- =============================================================================

BEGIN;

-- ── Self-gate: refuse unless the C6 retirement gate is satisfied ────────────
DO $$
DECLARE
  v_gate jsonb;
BEGIN
  IF to_regprocedure('resolution.c6_retirement_gate()') IS NULL THEN
    RAISE EXCEPTION
      'V144 self-gate FAILED: resolution.c6_retirement_gate() not present — apply V141 first'
      USING ERRCODE = 'P1000';
  END IF;

  v_gate := resolution.c6_retirement_gate();

  IF NOT COALESCE((v_gate->>'satisfied')::boolean, false) THEN
    RAISE EXCEPTION
      'V144 self-gate FAILED: c6_retirement_gate not satisfied — gate=% (green_soak_days=%, binding_signoffs=%, missing_twin=%, undisposed=%, non_closed=%). Stage D may not proceed until the ratified gate passes (Q-D/C1/C3).',
      v_gate,
      v_gate->>'green_soak_days',
      v_gate->>'binding_signoffs',
      v_gate->>'vision_receipts_missing_twin',
      v_gate->>'vision_tickets_undisposed',
      v_gate->>'vision_tickets_non_closed'
      USING ERRCODE = 'P1000';
  END IF;

  RAISE NOTICE 'V144 self-gate PASSED: c6_retirement_gate satisfied — proceeding with retirement';
END $$;

-- ── 1. Rename the legacy surfaces (data preserved, names go dark) ───────────
ALTER TABLE IF EXISTS vision.receipts RENAME TO receipts_retired;
ALTER TABLE IF EXISTS vision.tickets  RENAME TO tickets_retired;

-- ── 2. Defense in depth: revoke write privileges on the renamed tables ─────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT grantee, table_name FROM information_schema.role_table_grants
    WHERE table_schema = 'vision'
      AND table_name IN ('receipts_retired', 'tickets_retired')
      AND privilege_type IN ('INSERT','UPDATE','DELETE')
      AND grantee NOT IN ('pguser', 'postgres')
  LOOP
    EXECUTE format('REVOKE %s ON vision.%I FROM %I',
                   r.privilege_type, r.table_name, r.grantee);
    RAISE NOTICE 'V144: revoked % on vision.% from %',
                 r.privilege_type, r.table_name, r.grantee;
  END LOOP;
END $$;

COMMENT ON TABLE vision.receipts_retired IS
  'RETIRED by Stage D (V144): legacy vision.receipts, renamed by the self-gating retirement migration. Data preserved for audit; canonical stream is resolution.receipt. Restore: rename back (see V144 header).';
COMMENT ON TABLE vision.tickets_retired IS
  'RETIRED by Stage D (V144): legacy vision.tickets, renamed by the self-gating retirement migration. Data preserved for audit; canonical stream is resolution.ticket. Restore: rename back (see V144 header).';

COMMIT;

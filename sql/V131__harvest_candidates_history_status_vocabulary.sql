-- V131: expand harvest_candidates_history.status vocabulary (gate-blocker fix)
--
-- BUG (architect 2026-08-25 15:48Z): approving a harvest candidate from the
-- assembly-ui CandidateGatePanel 500s with
--   'new row for relation "harvest_candidates_history" violates check
--    constraint "harvest_candidates_status_check"'
--
-- Root cause: the history table's CHECK predates the gate-panel status
-- vocabulary. The panel writes 'approved' | 'struck' (and badges
-- 'reviewed' | 'discarded'); stage/promotion flows also write 'active'.
-- None of those were in the original enum {pending, linked, useful,
-- rejected, promoted, superseded}, so EVERY gate action failed at the
-- history INSERT.
--
-- Fix: widen the constraint to the union of all statuses any writer emits.
-- The live table carries no constraint (verified) — history only mirrors it.
--
-- Idempotent: DROP IF EXISTS before ADD. No data changes.

BEGIN;

ALTER TABLE nebula.harvest_candidates_history
    DROP CONSTRAINT IF EXISTS harvest_candidates_status_check;

ALTER TABLE nebula.harvest_candidates_history
    ADD CONSTRAINT harvest_candidates_status_check
    CHECK (((status IS NULL) OR (status = ANY (ARRAY[
        'pending'::text,
        'linked'::text,
        'useful'::text,
        'rejected'::text,
        'promoted'::text,
        'superseded'::text,
        'approved'::text,
        'struck'::text,
        'reviewed'::text,
        'discarded'::text,
        'active'::text
    ]))));

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
--  V091 — agent_scheduler v14 contract (T13, ratified decision 85ae61af)
--
--  Thread:       T13 — 1d71951c (architect pointer: contract decided
--                2026-08-03 in 85ae61af; T13 makes storage conform)
--  Decision ref: 85ae61af (scheduler/tackle/wind: single evaluation loop,
--                cron notation + event-stream criteria)
--  T14/T15:      runner moves to python/tackle, evaluate_tick() implements
--                the single evaluator (scheduler crontab stays PAUSED until
--                T15+T16 pass — shadow-run mode)
--
--  Changes:
--    1. ADD cron_expr TEXT       — canonical 5-field cron notation
--    2. ADD event_criteria JSONB — event-stream criteria (wind.events match)
--    3. Extend schedule_type CHECK to include 'event'
--    4. Backfill existing 'interval' rows → cron_expr (deterministic map:
--       schedule_value seconds → */N minutes when divisible, else hourly)
--    5. Verify
--
--  Idempotent: re-runnable via IF NOT EXISTS / DO guards.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Columns
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE tackle.agent_scheduler
    ADD COLUMN IF NOT EXISTS cron_expr       TEXT,
    ADD COLUMN IF NOT EXISTS event_criteria  JSONB;

-- ═══════════════════════════════════════════════════════════════════════
--  2. Extend schedule_type CHECK to include 'event'
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_constraint text;
BEGIN
    SELECT conname INTO v_constraint
    FROM pg_constraint
    WHERE conrelid = 'tackle.agent_scheduler'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%schedule_type%';

    IF v_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE tackle.agent_scheduler DROP CONSTRAINT %I', v_constraint);
    END IF;
END $$;

ALTER TABLE tackle.agent_scheduler
    ADD CONSTRAINT agent_scheduler_schedule_type_check
    CHECK (schedule_type IN ('interval', 'cron', 'manual', 'event'));

-- ═══════════════════════════════════════════════════════════════════════
--  3. Backfill: interval → cron_expr
--
--     Deterministic map (per 85ae61af normalization):
--       schedule_value % 60 == 0  → */<minutes> * * * *
--       otherwise                 → 0 * * * *  (hourly floor, documented)
--     Only fills rows that have no cron_expr yet and are still 'interval';
--     rows already 'cron' are left untouched. schedule_value is preserved
--     as the interval source of truth for backward-compatible readers.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE tackle.agent_scheduler
   SET cron_expr = CASE
         WHEN schedule_value > 0 AND schedule_value % 60 = 0
              THEN '*/' || (schedule_value / 60)::text || ' * * * *'
         ELSE '0 * * * *'
       END,
       updated_at = NOW()
 WHERE schedule_type = 'interval'
   AND (cron_expr IS NULL OR cron_expr = '');

-- ═══════════════════════════════════════════════════════════════════════
--  4. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_total     integer;
    v_with_cron integer;
    v_types     text;
BEGIN
    SELECT count(*) INTO v_total FROM tackle.agent_scheduler;
    SELECT count(*) INTO v_with_cron
    FROM tackle.agent_scheduler
    WHERE cron_expr IS NOT NULL AND cron_expr <> '';

    SELECT string_agg(DISTINCT schedule_type, ', ' ORDER BY schedule_type)
      INTO v_types FROM tackle.agent_scheduler;

    RAISE NOTICE 'V091 applied — % scheduler rows, % with cron_expr, schedule_type values: %',
        v_total, v_with_cron, v_types;
END $$;

COMMIT;

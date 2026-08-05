-- V063 — nebula system/subsystem/feature docs: add `path` column
--
-- Systems, subsystems and features are SCD4-bitemporal: the live views
-- (nebula.systems / nebula.subsystems / nebula.features) select the current
-- record from the `_history` base tables. Adding a documentation `path`
-- column (workspace location(s), mirroring semantics.owning_subsystem.path)
-- therefore requires:
--   1. ALTER TABLE on each _history base table, and
--   2. CREATE OR REPLACE VIEW to expose the new column (appended last so the
--      existing column set stays compatible).
--
-- Safe to re-apply. No data migration — path is backfilled via the REST API
-- (nebula-srv) so the SCD4 write path stays intact.

ALTER TABLE nebula.systems_history     ADD COLUMN IF NOT EXISTS path text;
ALTER TABLE nebula.subsystems_history  ADD COLUMN IF NOT EXISTS path text;
ALTER TABLE nebula.features_history    ADD COLUMN IF NOT EXISTS path text;

CREATE OR REPLACE VIEW nebula.systems AS
SELECT id,
       name,
       description,
       readme,
       architecture,
       created_at,
       recorded_on_dt,
       recorded_until_dt,
       valid_from,
       valid_until,
       path
FROM nebula.systems_history
WHERE ((now() >= recorded_on_dt) AND (now() < recorded_until_dt) AND (now() >= valid_from) AND (now() < valid_until));

CREATE OR REPLACE VIEW nebula.subsystems AS
SELECT id,
       system_id,
       name,
       description,
       readme,
       color,
       created_at,
       recorded_on_dt,
       recorded_until_dt,
       valid_from,
       valid_until,
       path
FROM nebula.subsystems_history
WHERE ((now() >= recorded_on_dt) AND (now() < recorded_until_dt) AND (now() >= valid_from) AND (now() < valid_until));

CREATE OR REPLACE VIEW nebula.features AS
SELECT id,
       subsystem_id,
       name,
       description,
       readme,
       created_at,
       recorded_on_dt,
       recorded_until_dt,
       valid_from,
       valid_until,
       path
FROM nebula.features_history
WHERE ((now() >= recorded_on_dt) AND (now() < recorded_until_dt) AND (now() >= valid_from) AND (now() < valid_until));

-- ── Verification ──────────────────────────────────────────────────
DO $$
DECLARE
  v_systems_path    int;
  v_subsystems_path int;
  v_features_path   int;
  v_live_views      int;
BEGIN
  SELECT count(*) INTO v_systems_path
    FROM information_schema.columns
   WHERE table_schema = 'nebula' AND table_name = 'systems' AND column_name = 'path';
  SELECT count(*) INTO v_subsystems_path
    FROM information_schema.columns
   WHERE table_schema = 'nebula' AND table_name = 'subsystems' AND column_name = 'path';
  SELECT count(*) INTO v_features_path
    FROM information_schema.columns
   WHERE table_schema = 'nebula' AND table_name = 'features' AND column_name = 'path';
  SELECT count(*) INTO v_live_views
    FROM information_schema.views
   WHERE table_schema = 'nebula' AND table_name IN ('systems', 'subsystems', 'features');

  IF v_systems_path <> 1 THEN RAISE EXCEPTION 'nebula.systems.path missing'; END IF;
  IF v_subsystems_path <> 1 THEN RAISE EXCEPTION 'nebula.subsystems.path missing'; END IF;
  IF v_features_path <> 1 THEN RAISE EXCEPTION 'nebula.features.path missing'; END IF;
  IF v_live_views <> 3 THEN RAISE EXCEPTION 'expected 3 live views, got %', v_live_views; END IF;

  RAISE NOTICE 'V063 OK — path column live on all three views';
END $$;

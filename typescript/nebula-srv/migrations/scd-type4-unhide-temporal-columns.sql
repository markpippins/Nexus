-- ═══════════════════════════════════════════════════════════════════════
--  SCD Type 4 — Unhide Temporal Columns in Views
--
--  Recreates all 13 nebula views to include as_of_dt and expiration_dt
--  columns so they are visible when querying the views directly.
--  The INSTEAD OF triggers remain unchanged.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. systems
CREATE OR REPLACE VIEW nebula.systems AS
SELECT id, name, description, readme, architecture, created_at,
       as_of_dt, expiration_dt
FROM   nebula.systems_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 2. subsystems
CREATE OR REPLACE VIEW nebula.subsystems AS
SELECT id, system_id, name, description, readme, color, created_at,
       as_of_dt, expiration_dt
FROM   nebula.subsystems_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 3. features
CREATE OR REPLACE VIEW nebula.features AS
SELECT id, subsystem_id, name, description, readme, created_at,
       as_of_dt, expiration_dt
FROM   nebula.features_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 4. requirements
CREATE OR REPLACE VIEW nebula.requirements AS
SELECT id, system_id, subsystem_id, feature_id,
       title, description, status, priority,
       start_date, completion_date, created_at, updated_at,
       as_of_dt, expiration_dt
FROM   nebula.requirements_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 5. system_folders
CREATE OR REPLACE VIEW nebula.system_folders AS
SELECT id, system_id, name, category, note,
       as_of_dt, expiration_dt
FROM   nebula.system_folders_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 6. work_sessions
CREATE OR REPLACE VIEW nebula.work_sessions AS
SELECT id, parent_id, parent_type, parent_name,
       context, platform, model, outcome, status,
       created_at, updated_at,
       as_of_dt, expiration_dt
FROM   nebula.work_sessions_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 7. system_workspaces
CREATE OR REPLACE VIEW nebula.system_workspaces AS
SELECT id, system_id, subsystem_id, workspace_path, created_at,
       as_of_dt, expiration_dt
FROM   nebula.system_workspaces_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 8. user_preferences
CREATE OR REPLACE VIEW nebula.user_preferences AS
SELECT user_id, key, value, updated_at,
       as_of_dt, expiration_dt
FROM   nebula.user_preferences_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 9. audit_files
CREATE OR REPLACE VIEW nebula.audit_files AS
SELECT id, file_path, content, size_bytes, updated_at,
       as_of_dt, expiration_dt
FROM   nebula.audit_files_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 10. system_info_tabs
CREATE OR REPLACE VIEW nebula.system_info_tabs AS
SELECT system_id, tab_id, content, updated_at,
       as_of_dt, expiration_dt
FROM   nebula.system_info_tabs_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 11. harvests
CREATE OR REPLACE VIEW nebula.harvests AS
SELECT id, source_path, source_filename, model, total_candidates,
       candidates, source_text, tags, metadata, created_at, updated_at,
       as_of_dt, expiration_dt
FROM   nebula.harvests_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 12. agent_records
CREATE OR REPLACE VIEW nebula.agent_records AS
SELECT id, record_type, role, title, content, source_path,
       metadata, tags, system_id, subsystem_id, feature_id,
       plan_ref, created_at, updated_at,
       as_of_dt, expiration_dt
FROM   nebula.agent_records_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- 13. projections
CREATE OR REPLACE VIEW nebula.projections AS
SELECT id, name, type, description, source_query, template,
       target_path, model, schedule, metadata, created_at, updated_at,
       as_of_dt, expiration_dt
FROM   nebula.projections_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- ── VERIFICATION ──
DO $$ DECLARE
    v_count INTEGER;
    v_cols  TEXT;
BEGIN
    -- Check a sample view for the temporal columns
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
      INTO v_cols
      FROM information_schema.columns c
     JOIN information_schema.tables t USING (table_schema, table_name)
     WHERE c.table_schema = 'nebula'
       AND c.table_name = 'systems'
       AND t.table_type = 'VIEW';
    RAISE NOTICE 'nebula.systems columns: %', v_cols;

    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
      INTO v_cols
      FROM information_schema.columns c
     JOIN information_schema.tables t USING (table_schema, table_name)
     WHERE c.table_schema = 'nebula'
       AND c.table_name = 'requirements'
       AND t.table_type = 'VIEW';
    RAISE NOTICE 'nebula.requirements columns: %', v_cols;

    -- Confirm data still resolves
    SELECT COUNT(*) INTO v_count FROM nebula.systems;
    RAISE NOTICE 'Active systems: %', v_count;
    SELECT COUNT(*) INTO v_count FROM nebula.requirements;
    RAISE NOTICE 'Active requirements: %', v_count;

    RAISE NOTICE '✅ All 13 views updated — as_of_dt and expiration_dt are now visible.';
END $$;

COMMIT;

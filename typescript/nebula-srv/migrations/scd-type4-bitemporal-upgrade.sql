-- ═══════════════════════════════════════════════════════════════════════
--  Bitemporal Upgrade — SCD Type 4 + Valid Time
--
--  What this does:
--    1. Rename as_of_dt → recorded_on_dt    (system time start)
--    2. Rename expiration_dt → recorded_until_dt  (system time end)
--    3. Add  valid_from / valid_until  (valid/business time)
--    4. Drop updated_at  (replaced by recorded_on_dt)
--    5. Recreate views with both time dimensions exposed
--    6. Recreate INSTEAD OF triggers with valid-time carry-forward
--
--  Valid time semantics:
--    INSERT:  valid_from defaults to NOW(), valid_until to sentinel
--    UPDATE:  valid_from/valid_until carried forward from old row
--    DELETE:  system-time expire only (valid time unchanged)
--
--  View filter: NOW() BETWEEN recorded_on_dt AND recorded_until_dt
--               AND NOW() BETWEEN valid_from AND valid_until
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 0 — Drop triggers, views, and old trigger functions
-- ═══════════════════════════════════════════════════════════════════════

-- Drop all INSTEAD OF triggers on the views
DO $$ DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE trigger_schema = 'nebula'
          AND event_object_schema = 'nebula'
          AND event_object_table NOT LIKE '%_history'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON nebula.%I', rec.trigger_name, rec.event_object_table);
    END LOOP;
END $$;

-- Drop all 13 views
DO $$ DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'nebula'
          AND table_name NOT LIKE '%_history'
    LOOP
        EXECUTE format('DROP VIEW IF EXISTS nebula.%I CASCADE', rec.table_name);
    END LOOP;
END $$;

-- Drop all old INSTEAD OF trigger functions
DO $$ DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT routine_name
        FROM information_schema.routines
        WHERE specific_schema = 'nebula'
          AND routine_name LIKE '%insert_trigger'
           OR routine_name LIKE '%update_trigger'
           OR routine_name LIKE '%delete_trigger'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS nebula.%I CASCADE', rec.routine_name);
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 1 — Drop PK constraints and partial unique indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Drop all PK constraints on _history tables
DO $$ DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT con.conname, cls.relname
        FROM pg_constraint con
        JOIN pg_class cls ON cls.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = con.connamespace
        WHERE con.contype = 'p'
          AND nsp.nspname = 'nebula'
          AND cls.relname LIKE '%_history'
    LOOP
        EXECUTE format('ALTER TABLE nebula.%I DROP CONSTRAINT %I', rec.relname, rec.conname);
    END LOOP;
END $$;

-- Drop partial unique indexes (active-row uniqueness)
DROP INDEX IF EXISTS nebula.idx_systems_active_id;
DROP INDEX IF EXISTS nebula.idx_subsystems_active_id;
DROP INDEX IF EXISTS nebula.idx_features_active_id;
DROP INDEX IF EXISTS nebula.idx_requirements_active_id;
DROP INDEX IF EXISTS nebula.idx_folders_active_id;
DROP INDEX IF EXISTS nebula.idx_sessions_active_id;
DROP INDEX IF EXISTS nebula.idx_workspaces_active_id;
DROP INDEX IF EXISTS nebula.idx_preferences_active_pk;
DROP INDEX IF EXISTS nebula.idx_audit_files_active_path;
DROP INDEX IF EXISTS nebula.idx_info_tabs_active_pk;
DROP INDEX IF EXISTS nebula.idx_harvests_active_id;
DROP INDEX IF EXISTS nebula.idx_agent_records_active_id;
DROP INDEX IF EXISTS nebula.idx_projections_active_id;

-- Also drop the active-row expiration_dbt indexes (system time)
DROP INDEX IF EXISTS nebula.idx_systems_history_active;
DROP INDEX IF EXISTS nebula.idx_subsystems_history_active;
DROP INDEX IF EXISTS nebula.idx_features_history_active;
DROP INDEX IF EXISTS nebula.idx_requirements_history_active;
DROP INDEX IF EXISTS nebula.idx_folders_history_active;
DROP INDEX IF EXISTS nebula.idx_sessions_history_active;
DROP INDEX IF EXISTS nebula.idx_workspaces_history_active;
DROP INDEX IF EXISTS nebula.idx_preferences_history_active;
DROP INDEX IF EXISTS nebula.idx_audit_files_history_active;
DROP INDEX IF EXISTS nebula.idx_info_tabs_history_active;
DROP INDEX IF EXISTS nebula.idx_harvests_history_active;
DROP INDEX IF EXISTS nebula.idx_agent_records_history_active;
DROP INDEX IF EXISTS nebula.idx_projections_history_active;

-- Drop other non-unique indexes (will be recreated)
DROP INDEX IF EXISTS nebula.idx_subsystems_history_system;
DROP INDEX IF EXISTS nebula.idx_features_history_subsystem;
DROP INDEX IF EXISTS nebula.idx_requirements_history_system;
DROP INDEX IF EXISTS nebula.idx_requirements_history_subsystem;
DROP INDEX IF EXISTS nebula.idx_requirements_history_feature;
DROP INDEX IF EXISTS nebula.idx_requirements_history_status;
DROP INDEX IF EXISTS nebula.idx_folders_history_system;
DROP INDEX IF EXISTS nebula.idx_workspaces_history_system;
DROP INDEX IF EXISTS nebula.idx_workspaces_history_subsystem;
DROP INDEX IF EXISTS nebula.idx_audit_files_history_path;

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 2 — Rename columns, add valid time, drop updated_at
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: rename as_of_dt → recorded_on_dt, expiration_dt → recorded_until_dt
--         add valid_from, valid_until, drop updated_at (if exists)

DO $$ DECLARE
    tables_with_updated_at TEXT[] := ARRAY[
        'agent_records_history', 'audit_files_history', 'harvests_history',
        'projections_history', 'requirements_history', 'system_info_tabs_history',
        'user_preferences_history', 'work_sessions_history'
    ];
    all_tables TEXT[] := ARRAY[
        'systems_history', 'subsystems_history', 'features_history',
        'requirements_history', 'system_folders_history', 'work_sessions_history',
        'system_workspaces_history', 'user_preferences_history',
        'audit_files_history', 'system_info_tabs_history',
        'harvests_history', 'agent_records_history', 'projections_history'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY all_tables
    LOOP
        -- Rename system time columns
        BEGIN
            EXECUTE format('ALTER TABLE nebula.%I RENAME COLUMN as_of_dt TO recorded_on_dt', t);
        EXCEPTION WHEN undefined_column THEN
            RAISE NOTICE 'as_of_dt not found on %.%, skipping rename', 'nebula', t;
        END;

        BEGIN
            EXECUTE format('ALTER TABLE nebula.%I RENAME COLUMN expiration_dt TO recorded_until_dt', t);
        EXCEPTION WHEN undefined_column THEN
            RAISE NOTICE 'expiration_dt not found on %.%, skipping rename', 'nebula', t;
        END;

        -- Add valid time columns
        BEGIN
            EXECUTE format('ALTER TABLE nebula.%I ADD COLUMN valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);
        EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'valid_from already exists on %.%', 'nebula', t;
        END;

        BEGIN
            EXECUTE format('ALTER TABLE nebula.%I ADD COLUMN valid_until TIMESTAMPTZ NOT NULL DEFAULT ''9999-12-31 23:59:59+00''::timestamptz', t);
        EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'valid_until already exists on %.%', 'nebula', t;
        END;
    END LOOP;

    -- Drop updated_at from tables that have it
    FOREACH t IN ARRAY tables_with_updated_at
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE nebula.%I DROP COLUMN updated_at', t);
            RAISE NOTICE 'Dropped updated_at from %.%', 'nebula', t;
        EXCEPTION WHEN undefined_column THEN
            RAISE NOTICE 'updated_at not found on %.%, skipping', 'nebula', t;
        END;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 3 — Recreate PKs and partial unique indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Tables with UUID id PK
ALTER TABLE nebula.systems_history           ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.subsystems_history        ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.features_history          ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.requirements_history      ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.system_folders_history    ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.work_sessions_history     ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.system_workspaces_history ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.audit_files_history       ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.harvests_history          ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.agent_records_history     ADD PRIMARY KEY (id, recorded_on_dt);
ALTER TABLE nebula.projections_history       ADD PRIMARY KEY (id, recorded_on_dt);

-- Tables with composite PKs
ALTER TABLE nebula.user_preferences_history   ADD PRIMARY KEY (user_id, key, recorded_on_dt);
ALTER TABLE nebula.system_info_tabs_history   ADD PRIMARY KEY (system_id, tab_id, recorded_on_dt);

-- Partial unique indexes — active-row uniqueness (system-time current only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_systems_active_id
    ON nebula.systems_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_subsystems_active_id
    ON nebula.subsystems_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_features_active_id
    ON nebula.features_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_requirements_active_id
    ON nebula.requirements_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_active_id
    ON nebula.system_folders_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_id
    ON nebula.work_sessions_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_active_id
    ON nebula.system_workspaces_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_active_pk
    ON nebula.user_preferences_history (user_id, key)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_files_active_path
    ON nebula.audit_files_history (file_path)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_info_tabs_active_pk
    ON nebula.system_info_tabs_history (system_id, tab_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_harvests_active_id
    ON nebula.harvests_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_records_active_id
    ON nebula.agent_records_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_projections_active_id
    ON nebula.projections_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

-- Non-unique indexes for query performance
CREATE INDEX IF NOT EXISTS idx_subsystems_history_system
    ON nebula.subsystems_history (system_id);

CREATE INDEX IF NOT EXISTS idx_features_history_subsystem
    ON nebula.features_history (subsystem_id);

CREATE INDEX IF NOT EXISTS idx_requirements_history_system
    ON nebula.requirements_history (system_id);

CREATE INDEX IF NOT EXISTS idx_requirements_history_subsystem
    ON nebula.requirements_history (subsystem_id);

CREATE INDEX IF NOT EXISTS idx_requirements_history_feature
    ON nebula.requirements_history (feature_id);

CREATE INDEX IF NOT EXISTS idx_requirements_history_status
    ON nebula.requirements_history (status);

CREATE INDEX IF NOT EXISTS idx_folders_history_system
    ON nebula.system_folders_history (system_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_history_system
    ON nebula.system_workspaces_history (system_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_history_subsystem
    ON nebula.system_workspaces_history (subsystem_id);

CREATE INDEX IF NOT EXISTS idx_audit_files_history_path
    ON nebula.audit_files_history (file_path);

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 4 — Recreate all 13 views with both time dimensions
-- ═══════════════════════════════════════════════════════════════════════

-- 1. systems
CREATE OR REPLACE VIEW nebula.systems AS
SELECT id, name, description, readme, architecture, created_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.systems_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 2. subsystems
CREATE OR REPLACE VIEW nebula.subsystems AS
SELECT id, system_id, name, description, readme, color, created_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.subsystems_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 3. features
CREATE OR REPLACE VIEW nebula.features AS
SELECT id, subsystem_id, name, description, readme, created_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.features_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 4. requirements
CREATE OR REPLACE VIEW nebula.requirements AS
SELECT id, system_id, subsystem_id, feature_id,
       title, description, status, priority,
       start_date, completion_date, created_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.requirements_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 5. system_folders
CREATE OR REPLACE VIEW nebula.system_folders AS
SELECT id, system_id, name, category, note,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.system_folders_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 6. work_sessions
CREATE OR REPLACE VIEW nebula.work_sessions AS
SELECT id, parent_id, parent_type, parent_name,
       context, platform, model, outcome, status,
       created_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.work_sessions_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 7. system_workspaces
CREATE OR REPLACE VIEW nebula.system_workspaces AS
SELECT id, system_id, subsystem_id, workspace_path, created_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.system_workspaces_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 8. user_preferences
CREATE OR REPLACE VIEW nebula.user_preferences AS
SELECT user_id, key, value,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.user_preferences_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 9. audit_files
CREATE OR REPLACE VIEW nebula.audit_files AS
SELECT id, file_path, content, size_bytes,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.audit_files_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 10. system_info_tabs
CREATE OR REPLACE VIEW nebula.system_info_tabs AS
SELECT system_id, tab_id, content,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.system_info_tabs_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 11. harvests
CREATE OR REPLACE VIEW nebula.harvests AS
SELECT id, source_path, source_filename, model, total_candidates,
       candidates, source_text, tags, metadata, created_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.harvests_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 12. agent_records
CREATE OR REPLACE VIEW nebula.agent_records AS
SELECT id, record_type, role, title, content, source_path,
       metadata, tags, system_id, subsystem_id, feature_id,
       plan_ref, created_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.agent_records_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- 13. projections
CREATE OR REPLACE VIEW nebula.projections AS
SELECT id, name, type, description, source_query, template,
       target_path, model, schedule, metadata, created_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.projections_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 5 — Recreate INSTEAD OF INSERT trigger functions
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. systems ──
CREATE OR REPLACE FUNCTION nebula.systems_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.systems_history
        (id, name, description, readme, architecture, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.name, NEW.description, NEW.readme, NEW.architecture,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. subsystems ──
CREATE OR REPLACE FUNCTION nebula.subsystems_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.subsystems_history
        (id, system_id, name, description, readme, color, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.system_id, NEW.name, NEW.description, NEW.readme, NEW.color,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. features ──
CREATE OR REPLACE FUNCTION nebula.features_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.features_history
        (id, subsystem_id, name, description, readme, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.subsystem_id, NEW.name, NEW.description, NEW.readme,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 4. requirements ──
CREATE OR REPLACE FUNCTION nebula.requirements_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.requirements_history
        (id, system_id, subsystem_id, feature_id, title, description,
         status, priority, start_date, completion_date, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.system_id, NEW.subsystem_id, NEW.feature_id,
         NEW.title, NEW.description, NEW.status, NEW.priority,
         NEW.start_date, NEW.completion_date, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 5. system_folders ──
CREATE OR REPLACE FUNCTION nebula.system_folders_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.system_folders_history
        (id, system_id, name, category, note,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.system_id, NEW.name, NEW.category, NEW.note,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 6. work_sessions ──
CREATE OR REPLACE FUNCTION nebula.work_sessions_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.work_sessions_history
        (id, parent_id, parent_type, parent_name, context, platform,
         model, outcome, status, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.parent_id, NEW.parent_type, NEW.parent_name,
         NEW.context, NEW.platform, NEW.model, NEW.outcome, NEW.status,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 7. system_workspaces ──
CREATE OR REPLACE FUNCTION nebula.system_workspaces_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.system_workspaces_history
        (id, system_id, subsystem_id, workspace_path, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.system_id, NEW.subsystem_id, NEW.workspace_path,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 8. user_preferences ──
CREATE OR REPLACE FUNCTION nebula.user_preferences_insert_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO nebula.user_preferences_history
        (user_id, key, value,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (NEW.user_id, NEW.key, NEW.value,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 9. audit_files ──
CREATE OR REPLACE FUNCTION nebula.audit_files_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.audit_files_history
        (id, file_path, content, size_bytes,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.file_path, NEW.content, NEW.size_bytes,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 10. system_info_tabs ──
CREATE OR REPLACE FUNCTION nebula.system_info_tabs_insert_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO nebula.system_info_tabs_history
        (system_id, tab_id, content,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (NEW.system_id, NEW.tab_id, NEW.content,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 11. harvests ──
CREATE OR REPLACE FUNCTION nebula.harvests_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.harvests_history
        (id, source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.source_path, NEW.source_filename, NEW.model,
         NEW.total_candidates, NEW.candidates, NEW.source_text,
         NEW.tags, NEW.metadata, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 12. agent_records ──
CREATE OR REPLACE FUNCTION nebula.agent_records_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.agent_records_history
        (id, record_type, role, title, content, source_path,
         metadata, tags, system_id, subsystem_id, feature_id,
         plan_ref, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.record_type, NEW.role, NEW.title, NEW.content,
         NEW.source_path, NEW.metadata, NEW.tags, NEW.system_id,
         NEW.subsystem_id, NEW.feature_id, NEW.plan_ref,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 13. projections ──
CREATE OR REPLACE FUNCTION nebula.projections_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.projections_history
        (id, name, type, description, source_query, template,
         target_path, model, schedule, metadata, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.name, NEW.type, NEW.description, NEW.source_query,
         NEW.template, NEW.target_path, NEW.model, NEW.schedule,
         NEW.metadata, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 6 — Recreate INSTEAD OF UPDATE trigger functions
--              Valid time is CARRIED FORWARD from old row
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. systems ──
CREATE OR REPLACE FUNCTION nebula.systems_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.systems_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.systems_history
        (id, name, description, readme, architecture, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.name, NEW.description, NEW.readme, NEW.architecture,
         OLD.created_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, name, description, readme, architecture, created_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 2. subsystems ──
CREATE OR REPLACE FUNCTION nebula.subsystems_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.subsystems_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.subsystems_history
        (id, system_id, name, description, readme, color, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.system_id, NEW.name, NEW.description, NEW.readme,
         NEW.color, OLD.created_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, system_id, name, description, readme, color, created_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 3. features ──
CREATE OR REPLACE FUNCTION nebula.features_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.features_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.features_history
        (id, subsystem_id, name, description, readme, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.subsystem_id, NEW.name, NEW.description, NEW.readme,
         OLD.created_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, subsystem_id, name, description, readme, created_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 4. requirements ──
CREATE OR REPLACE FUNCTION nebula.requirements_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.requirements_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.requirements_history
        (id, system_id, subsystem_id, feature_id, title, description,
         status, priority, start_date, completion_date, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.system_id, NEW.subsystem_id, NEW.feature_id,
         NEW.title, NEW.description, NEW.status, NEW.priority,
         NEW.start_date, NEW.completion_date, OLD.created_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, system_id, subsystem_id, feature_id,
              title, description, status, priority,
              start_date, completion_date, created_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 5. system_folders ──
CREATE OR REPLACE FUNCTION nebula.system_folders_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.system_folders_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.system_folders_history
        (id, system_id, name, category, note,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.system_id, NEW.name, NEW.category, NEW.note,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, system_id, name, category, note,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 6. work_sessions ──
CREATE OR REPLACE FUNCTION nebula.work_sessions_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.work_sessions_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.work_sessions_history
        (id, parent_id, parent_type, parent_name, context, platform,
         model, outcome, status, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.parent_id, NEW.parent_type, NEW.parent_name,
         NEW.context, NEW.platform, NEW.model, NEW.outcome, NEW.status,
         OLD.created_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, parent_id, parent_type, parent_name,
              context, platform, model, outcome, status, created_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 7. system_workspaces ──
CREATE OR REPLACE FUNCTION nebula.system_workspaces_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.system_workspaces_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.system_workspaces_history
        (id, system_id, subsystem_id, workspace_path, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.system_id, NEW.subsystem_id, NEW.workspace_path,
         OLD.created_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, system_id, subsystem_id, workspace_path, created_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 8. user_preferences ──
CREATE OR REPLACE FUNCTION nebula.user_preferences_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.user_preferences_history
    SET    recorded_until_dt = NOW()
    WHERE  user_id = OLD.user_id AND key = OLD.key
      AND  recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.user_preferences_history
        (user_id, key, value,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.user_id, OLD.key, NEW.value,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING user_id, key, value,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 9. audit_files ──
CREATE OR REPLACE FUNCTION nebula.audit_files_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.audit_files_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.audit_files_history
        (id, file_path, content, size_bytes,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.file_path, NEW.content, NEW.size_bytes,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, file_path, content, size_bytes,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 10. system_info_tabs ──
CREATE OR REPLACE FUNCTION nebula.system_info_tabs_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.system_info_tabs_history
    SET    recorded_until_dt = NOW()
    WHERE  system_id = OLD.system_id AND tab_id = OLD.tab_id
      AND  recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.system_info_tabs_history
        (system_id, tab_id, content,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.system_id, OLD.tab_id, NEW.content,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING system_id, tab_id, content,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 11. harvests ──
CREATE OR REPLACE FUNCTION nebula.harvests_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.harvests_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.harvests_history
        (id, source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.source_path, NEW.source_filename, NEW.model,
         NEW.total_candidates, NEW.candidates, NEW.source_text,
         NEW.tags, NEW.metadata, OLD.created_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, source_path, source_filename, model, total_candidates,
              candidates, source_text, tags, metadata, created_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 12. agent_records ──
CREATE OR REPLACE FUNCTION nebula.agent_records_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.agent_records_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.agent_records_history
        (id, record_type, role, title, content, source_path,
         metadata, tags, system_id, subsystem_id, feature_id,
         plan_ref, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.record_type, NEW.role, NEW.title, NEW.content,
         NEW.source_path, NEW.metadata, NEW.tags, NEW.system_id,
         NEW.subsystem_id, NEW.feature_id, NEW.plan_ref,
         OLD.created_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, record_type, role, title, content, source_path,
              metadata, tags, system_id, subsystem_id, feature_id,
              plan_ref, created_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ── 13. projections ──
CREATE OR REPLACE FUNCTION nebula.projections_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.projections_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.projections_history
        (id, name, type, description, source_query, template,
         target_path, model, schedule, metadata, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.name, NEW.type, NEW.description, NEW.source_query,
         NEW.template, NEW.target_path, NEW.model, NEW.schedule,
         NEW.metadata, OLD.created_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, name, type, description, source_query, template,
              target_path, model, schedule, metadata, created_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 7 — Recreate INSTEAD OF DELETE trigger functions
--              (system-time soft delete only, valid time unchanged)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. systems
CREATE OR REPLACE FUNCTION nebula.systems_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.systems_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 2. subsystems
CREATE OR REPLACE FUNCTION nebula.subsystems_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.subsystems_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 3. features
CREATE OR REPLACE FUNCTION nebula.features_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.features_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 4. requirements
CREATE OR REPLACE FUNCTION nebula.requirements_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.requirements_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 5. system_folders
CREATE OR REPLACE FUNCTION nebula.system_folders_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.system_folders_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 6. work_sessions
CREATE OR REPLACE FUNCTION nebula.work_sessions_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.work_sessions_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 7. system_workspaces
CREATE OR REPLACE FUNCTION nebula.system_workspaces_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.system_workspaces_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 8. user_preferences
CREATE OR REPLACE FUNCTION nebula.user_preferences_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.user_preferences_history
    SET    recorded_until_dt = NOW()
    WHERE  user_id = OLD.user_id AND key = OLD.key
      AND  recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 9. audit_files
CREATE OR REPLACE FUNCTION nebula.audit_files_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.audit_files_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 10. system_info_tabs
CREATE OR REPLACE FUNCTION nebula.system_info_tabs_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.system_info_tabs_history
    SET    recorded_until_dt = NOW()
    WHERE  system_id = OLD.system_id AND tab_id = OLD.tab_id
      AND  recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 11. harvests
CREATE OR REPLACE FUNCTION nebula.harvests_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.harvests_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 12. agent_records
CREATE OR REPLACE FUNCTION nebula.agent_records_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.agent_records_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 13. projections
CREATE OR REPLACE FUNCTION nebula.projections_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.projections_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 8 — Attach all INSTEAD OF triggers to views
-- ═══════════════════════════════════════════════════════════════════════

-- 1. systems
CREATE TRIGGER trg_systems_insert
    INSTEAD OF INSERT ON nebula.systems
    FOR EACH ROW EXECUTE FUNCTION nebula.systems_insert_trigger();
CREATE TRIGGER trg_systems_update
    INSTEAD OF UPDATE ON nebula.systems
    FOR EACH ROW EXECUTE FUNCTION nebula.systems_update_trigger();
CREATE TRIGGER trg_systems_delete
    INSTEAD OF DELETE ON nebula.systems
    FOR EACH ROW EXECUTE FUNCTION nebula.systems_delete_trigger();

-- 2. subsystems
CREATE TRIGGER trg_subsystems_insert
    INSTEAD OF INSERT ON nebula.subsystems
    FOR EACH ROW EXECUTE FUNCTION nebula.subsystems_insert_trigger();
CREATE TRIGGER trg_subsystems_update
    INSTEAD OF UPDATE ON nebula.subsystems
    FOR EACH ROW EXECUTE FUNCTION nebula.subsystems_update_trigger();
CREATE TRIGGER trg_subsystems_delete
    INSTEAD OF DELETE ON nebula.subsystems
    FOR EACH ROW EXECUTE FUNCTION nebula.subsystems_delete_trigger();

-- 3. features
CREATE TRIGGER trg_features_insert
    INSTEAD OF INSERT ON nebula.features
    FOR EACH ROW EXECUTE FUNCTION nebula.features_insert_trigger();
CREATE TRIGGER trg_features_update
    INSTEAD OF UPDATE ON nebula.features
    FOR EACH ROW EXECUTE FUNCTION nebula.features_update_trigger();
CREATE TRIGGER trg_features_delete
    INSTEAD OF DELETE ON nebula.features
    FOR EACH ROW EXECUTE FUNCTION nebula.features_delete_trigger();

-- 4. requirements
CREATE TRIGGER trg_requirements_insert
    INSTEAD OF INSERT ON nebula.requirements
    FOR EACH ROW EXECUTE FUNCTION nebula.requirements_insert_trigger();
CREATE TRIGGER trg_requirements_update
    INSTEAD OF UPDATE ON nebula.requirements
    FOR EACH ROW EXECUTE FUNCTION nebula.requirements_update_trigger();
CREATE TRIGGER trg_requirements_delete
    INSTEAD OF DELETE ON nebula.requirements
    FOR EACH ROW EXECUTE FUNCTION nebula.requirements_delete_trigger();

-- 5. system_folders
CREATE TRIGGER trg_system_folders_insert
    INSTEAD OF INSERT ON nebula.system_folders
    FOR EACH ROW EXECUTE FUNCTION nebula.system_folders_insert_trigger();
CREATE TRIGGER trg_system_folders_update
    INSTEAD OF UPDATE ON nebula.system_folders
    FOR EACH ROW EXECUTE FUNCTION nebula.system_folders_update_trigger();
CREATE TRIGGER trg_system_folders_delete
    INSTEAD OF DELETE ON nebula.system_folders
    FOR EACH ROW EXECUTE FUNCTION nebula.system_folders_delete_trigger();

-- 6. work_sessions
CREATE TRIGGER trg_work_sessions_insert
    INSTEAD OF INSERT ON nebula.work_sessions
    FOR EACH ROW EXECUTE FUNCTION nebula.work_sessions_insert_trigger();
CREATE TRIGGER trg_work_sessions_update
    INSTEAD OF UPDATE ON nebula.work_sessions
    FOR EACH ROW EXECUTE FUNCTION nebula.work_sessions_update_trigger();
CREATE TRIGGER trg_work_sessions_delete
    INSTEAD OF DELETE ON nebula.work_sessions
    FOR EACH ROW EXECUTE FUNCTION nebula.work_sessions_delete_trigger();

-- 7. system_workspaces
CREATE TRIGGER trg_system_workspaces_insert
    INSTEAD OF INSERT ON nebula.system_workspaces
    FOR EACH ROW EXECUTE FUNCTION nebula.system_workspaces_insert_trigger();
CREATE TRIGGER trg_system_workspaces_update
    INSTEAD OF UPDATE ON nebula.system_workspaces
    FOR EACH ROW EXECUTE FUNCTION nebula.system_workspaces_update_trigger();
CREATE TRIGGER trg_system_workspaces_delete
    INSTEAD OF DELETE ON nebula.system_workspaces
    FOR EACH ROW EXECUTE FUNCTION nebula.system_workspaces_delete_trigger();

-- 8. user_preferences
CREATE TRIGGER trg_user_preferences_insert
    INSTEAD OF INSERT ON nebula.user_preferences
    FOR EACH ROW EXECUTE FUNCTION nebula.user_preferences_insert_trigger();
CREATE TRIGGER trg_user_preferences_update
    INSTEAD OF UPDATE ON nebula.user_preferences
    FOR EACH ROW EXECUTE FUNCTION nebula.user_preferences_update_trigger();
CREATE TRIGGER trg_user_preferences_delete
    INSTEAD OF DELETE ON nebula.user_preferences
    FOR EACH ROW EXECUTE FUNCTION nebula.user_preferences_delete_trigger();

-- 9. audit_files
CREATE TRIGGER trg_audit_files_insert
    INSTEAD OF INSERT ON nebula.audit_files
    FOR EACH ROW EXECUTE FUNCTION nebula.audit_files_insert_trigger();
CREATE TRIGGER trg_audit_files_update
    INSTEAD OF UPDATE ON nebula.audit_files
    FOR EACH ROW EXECUTE FUNCTION nebula.audit_files_update_trigger();
CREATE TRIGGER trg_audit_files_delete
    INSTEAD OF DELETE ON nebula.audit_files
    FOR EACH ROW EXECUTE FUNCTION nebula.audit_files_delete_trigger();

-- 10. system_info_tabs
CREATE TRIGGER trg_system_info_tabs_insert
    INSTEAD OF INSERT ON nebula.system_info_tabs
    FOR EACH ROW EXECUTE FUNCTION nebula.system_info_tabs_insert_trigger();
CREATE TRIGGER trg_system_info_tabs_update
    INSTEAD OF UPDATE ON nebula.system_info_tabs
    FOR EACH ROW EXECUTE FUNCTION nebula.system_info_tabs_update_trigger();
CREATE TRIGGER trg_system_info_tabs_delete
    INSTEAD OF DELETE ON nebula.system_info_tabs
    FOR EACH ROW EXECUTE FUNCTION nebula.system_info_tabs_delete_trigger();

-- 11. harvests
CREATE TRIGGER trg_harvests_insert
    INSTEAD OF INSERT ON nebula.harvests
    FOR EACH ROW EXECUTE FUNCTION nebula.harvests_insert_trigger();
CREATE TRIGGER trg_harvests_update
    INSTEAD OF UPDATE ON nebula.harvests
    FOR EACH ROW EXECUTE FUNCTION nebula.harvests_update_trigger();
CREATE TRIGGER trg_harvests_delete
    INSTEAD OF DELETE ON nebula.harvests
    FOR EACH ROW EXECUTE FUNCTION nebula.harvests_delete_trigger();

-- 12. agent_records
CREATE TRIGGER trg_agent_records_insert
    INSTEAD OF INSERT ON nebula.agent_records
    FOR EACH ROW EXECUTE FUNCTION nebula.agent_records_insert_trigger();
CREATE TRIGGER trg_agent_records_update
    INSTEAD OF UPDATE ON nebula.agent_records
    FOR EACH ROW EXECUTE FUNCTION nebula.agent_records_update_trigger();
CREATE TRIGGER trg_agent_records_delete
    INSTEAD OF DELETE ON nebula.agent_records
    FOR EACH ROW EXECUTE FUNCTION nebula.agent_records_delete_trigger();

-- 13. projections
CREATE TRIGGER trg_projections_insert
    INSTEAD OF INSERT ON nebula.projections
    FOR EACH ROW EXECUTE FUNCTION nebula.projections_insert_trigger();
CREATE TRIGGER trg_projections_update
    INSTEAD OF UPDATE ON nebula.projections
    FOR EACH ROW EXECUTE FUNCTION nebula.projections_update_trigger();
CREATE TRIGGER trg_projections_delete
    INSTEAD OF DELETE ON nebula.projections
    FOR EACH ROW EXECUTE FUNCTION nebula.projections_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_count INTEGER;
    v_cols  TEXT;
    v_trig  TEXT;
BEGIN
    -- Verify column names on _history table
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
      INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'nebula' AND table_name = 'systems_history';
    RAISE NOTICE 'systems_history columns: %', v_cols;

    -- Verify view columns
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
      INTO v_cols
      FROM information_schema.columns c
      JOIN information_schema.tables t USING (table_schema, table_name)
     WHERE c.table_schema = 'nebula' AND c.table_name = 'systems'
       AND t.table_type = 'VIEW';
    RAISE NOTICE 'nebula.systems (view) columns: %', v_cols;

    -- Verify triggers on a sample view
    SELECT string_agg(trigger_name, ', ') INTO v_trig
      FROM information_schema.triggers
     WHERE event_object_schema = 'nebula' AND event_object_table = 'requirements';
    RAISE NOTICE 'nebula.requirements triggers: %', v_trig;

    -- Verify row counts through views
    SELECT COUNT(*) INTO v_count FROM nebula.systems;
    RAISE NOTICE 'Active systems: %', v_count;
    SELECT COUNT(*) INTO v_count FROM nebula.requirements;
    RAISE NOTICE 'Active requirements: %', v_count;

    RAISE NOTICE '✅ Bitemporal upgrade complete — recorded_on_dt, recorded_until_dt, valid_from, valid_until active on all 13 tables.';
END $$;

COMMIT;

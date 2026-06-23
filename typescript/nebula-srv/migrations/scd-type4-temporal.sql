-- ═══════════════════════════════════════════════════════════════════════
--  SCD Type 4 — System-Versioned Temporal Tables
--  Migration for the nebula schema.
--
--  Strategy:
--    1. Drop triggers and FK constraints.
--    2. Rename each base table → {table}_history.
--    3. Add as_of_dt / expiration_dt columns.
--    4. Alter PK to (original_pk_columns, as_of_dt).
--    5. Backfill existing rows as currently active.
--    6. Create a VIEW with the original name exposing only active rows
--       (hides temporal columns — app code needs zero changes).
--    7. Create INSTEAD OF triggers on the view so INSERT/UPDATE/DELETE
--       transparently maintain the temporal history.
--
--  ╔══════════════════════════════════════════════════════════════════╗
--  ║  KNOWN COMPATIBILITY ISSUES WITH APPLICATION CODE              ║
--  ║  The following SQL patterns in routes.ts need updating:         ║
--  ║                                                                  ║
--  ║  1. SELECT ... FOR UPDATE on views with INSTEAD OF triggers     ║
--  ║     is NOT supported by PostgreSQL. The kanban move endpoint    ║
--  ║     (POST /api/requirements/:id/move) uses this. Fix: query    ║
--  ║     the _history table directly with active-row filter.         ║
--  ║                                                                  ║
--  ║  2. INSERT ... ON CONFLICT through views is NOT supported.      ║
--  ║     Affected endpoints: import, preferences upsert, info tabs   ║
--  ║     upsert, audit sync. Fix: query _history tables directly     ║
--  ║     or add existence checks.                                    ║
--  ║                                                                  ║
--  ║  See COMPATIBILITY_FIXES section at the end of this file.       ║
--  ╚══════════════════════════════════════════════════════════════════╝
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f scd-type4-temporal.sql
--
--  ⚠  BACK UP YOUR DATABASE BEFORE RUNNING.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  0. DROP ALL EXISTING FK CONSTRAINTS
--     App code manages relationships logically; DB-enforced FKs would
--     break across temporal versions. We drop them all here rather than
--     trying to rebuild them across the _history tables.
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT con.conname AS constraint_name,
               cls.relname AS table_name
        FROM   pg_constraint con
        JOIN   pg_class cls ON cls.oid = con.conrelid
        JOIN   pg_namespace nsp ON nsp.oid = con.connamespace
        WHERE  contype = 'f'
        AND    nsp.nspname = 'nebula'
    LOOP
        EXECUTE format('ALTER TABLE nebula.%I DROP CONSTRAINT %I',
                       rec.table_name, rec.constraint_name);
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  HELPER: expiry sentinel constant (9999-12-31 23:59:59+00 UTC)
-- ═══════════════════════════════════════════════════════════════════════

-- We use '9999-12-31 23:59:59+00'::timestamptz as a literal everywhere.

-- ═══════════════════════════════════════════════════════════════════════
--  HELPER: Generic INSTEAD OF INSERT trigger function
--  Creates a new temporal row. If the PK column is UUID with
--  gen_random_uuid() default, preserves auto-generation.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
--  1. systems
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_systems_updated_at ON nebula.systems;

ALTER TABLE nebula.systems RENAME TO systems_history;

ALTER TABLE nebula.systems_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.systems_history DROP CONSTRAINT systems_pkey;
ALTER TABLE nebula.systems_history ADD PRIMARY KEY (id, as_of_dt);

-- Backfill: existing rows are active from their creation
UPDATE nebula.systems_history
SET    as_of_dt = COALESCE(created_at, NOW()),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_systems_history_active
    ON nebula.systems_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Live view — same columns as original, temporal columns hidden
CREATE OR REPLACE VIEW nebula.systems AS
SELECT id, name, description, readme, architecture, created_at
FROM   nebula.systems_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.systems_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.systems_history (id, name, description, readme, architecture, created_at, as_of_dt, expiration_dt)
    VALUES (new_id, NEW.name, NEW.description, NEW.readme, NEW.architecture, COALESCE(NEW.created_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_systems_insert
    INSTEAD OF INSERT ON nebula.systems
    FOR EACH ROW EXECUTE FUNCTION nebula.systems_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.systems_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    -- Expire current row
    UPDATE nebula.systems_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    -- Insert new version
    INSERT INTO nebula.systems_history (id, name, description, readme, architecture, created_at, as_of_dt, expiration_dt)
    VALUES (OLD.id, NEW.name, NEW.description, NEW.readme, NEW.architecture, OLD.created_at, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, name, description, readme, architecture, created_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_systems_update
    INSTEAD OF UPDATE ON nebula.systems
    FOR EACH ROW EXECUTE FUNCTION nebula.systems_update_trigger();

CREATE OR REPLACE FUNCTION nebula.systems_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.systems_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_systems_delete
    INSTEAD OF DELETE ON nebula.systems
    FOR EACH ROW EXECUTE FUNCTION nebula.systems_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  2. subsystems
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_subsystems_updated_at ON nebula.subsystems;

ALTER TABLE nebula.subsystems RENAME TO subsystems_history;

ALTER TABLE nebula.subsystems_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.subsystems_history DROP CONSTRAINT subsystems_pkey;
ALTER TABLE nebula.subsystems_history ADD PRIMARY KEY (id, as_of_dt);

UPDATE nebula.subsystems_history
SET    as_of_dt = COALESCE(created_at, NOW()),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_subsystems_history_active
    ON nebula.subsystems_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_subsystems_history_system
    ON nebula.subsystems_history (system_id);

CREATE OR REPLACE VIEW nebula.subsystems AS
SELECT id, system_id, name, description, readme, color, created_at
FROM   nebula.subsystems_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.subsystems_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.subsystems_history (id, system_id, name, description, readme, color, created_at, as_of_dt, expiration_dt)
    VALUES (new_id, NEW.system_id, NEW.name, NEW.description, NEW.readme, NEW.color, COALESCE(NEW.created_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subsystems_insert
    INSTEAD OF INSERT ON nebula.subsystems
    FOR EACH ROW EXECUTE FUNCTION nebula.subsystems_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.subsystems_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.subsystems_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.subsystems_history (id, system_id, name, description, readme, color, created_at, as_of_dt, expiration_dt)
    VALUES (OLD.id, NEW.system_id, NEW.name, NEW.description, NEW.readme, NEW.color, OLD.created_at, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, system_id, name, description, readme, color, created_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subsystems_update
    INSTEAD OF UPDATE ON nebula.subsystems
    FOR EACH ROW EXECUTE FUNCTION nebula.subsystems_update_trigger();

CREATE OR REPLACE FUNCTION nebula.subsystems_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.subsystems_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subsystems_delete
    INSTEAD OF DELETE ON nebula.subsystems
    FOR EACH ROW EXECUTE FUNCTION nebula.subsystems_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  3. features
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_features_updated_at ON nebula.features;

ALTER TABLE nebula.features RENAME TO features_history;

ALTER TABLE nebula.features_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.features_history DROP CONSTRAINT features_pkey;
ALTER TABLE nebula.features_history ADD PRIMARY KEY (id, as_of_dt);

UPDATE nebula.features_history
SET    as_of_dt = COALESCE(created_at, NOW()),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_features_history_active
    ON nebula.features_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_features_history_subsystem
    ON nebula.features_history (subsystem_id);

CREATE OR REPLACE VIEW nebula.features AS
SELECT id, subsystem_id, name, description, readme, created_at
FROM   nebula.features_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.features_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.features_history (id, subsystem_id, name, description, readme, created_at, as_of_dt, expiration_dt)
    VALUES (new_id, NEW.subsystem_id, NEW.name, NEW.description, NEW.readme, COALESCE(NEW.created_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_features_insert
    INSTEAD OF INSERT ON nebula.features
    FOR EACH ROW EXECUTE FUNCTION nebula.features_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.features_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.features_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.features_history (id, subsystem_id, name, description, readme, created_at, as_of_dt, expiration_dt)
    VALUES (OLD.id, NEW.subsystem_id, NEW.name, NEW.description, NEW.readme, OLD.created_at, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, subsystem_id, name, description, readme, created_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_features_update
    INSTEAD OF UPDATE ON nebula.features
    FOR EACH ROW EXECUTE FUNCTION nebula.features_update_trigger();

CREATE OR REPLACE FUNCTION nebula.features_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.features_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_features_delete
    INSTEAD OF DELETE ON nebula.features
    FOR EACH ROW EXECUTE FUNCTION nebula.features_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  4. requirements
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_requirements_updated_at ON nebula.requirements;

ALTER TABLE nebula.requirements RENAME TO requirements_history;

ALTER TABLE nebula.requirements_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.requirements_history DROP CONSTRAINT requirements_pkey;
ALTER TABLE nebula.requirements_history ADD PRIMARY KEY (id, as_of_dt);

UPDATE nebula.requirements_history
SET    as_of_dt = COALESCE(created_at, NOW()),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_requirements_history_active
    ON nebula.requirements_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_requirements_history_system
    ON nebula.requirements_history (system_id);
CREATE INDEX IF NOT EXISTS idx_requirements_history_subsystem
    ON nebula.requirements_history (subsystem_id);
CREATE INDEX IF NOT EXISTS idx_requirements_history_feature
    ON nebula.requirements_history (feature_id);
CREATE INDEX IF NOT EXISTS idx_requirements_history_status
    ON nebula.requirements_history (status);

-- CHECK constraints are preserved on the _history table automatically
-- (they were part of the original table DDL). Verify:
--   status CHECK IN ('Backlog','ToDo','InProgress','Active','Blocked','Done','Cancelled','Accepted')
--   priority CHECK IN ('Low','Medium','High')

CREATE OR REPLACE VIEW nebula.requirements AS
SELECT id, system_id, subsystem_id, feature_id,
       title, description, status, priority,
       start_date, completion_date, created_at, updated_at
FROM   nebula.requirements_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.requirements_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.requirements_history
        (id, system_id, subsystem_id, feature_id, title, description, status, priority,
         start_date, completion_date, created_at, updated_at, as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.system_id, NEW.subsystem_id, NEW.feature_id, NEW.title, NEW.description,
         NEW.status, NEW.priority, NEW.start_date, NEW.completion_date,
         COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_requirements_insert
    INSTEAD OF INSERT ON nebula.requirements
    FOR EACH ROW EXECUTE FUNCTION nebula.requirements_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.requirements_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.requirements_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.requirements_history
        (id, system_id, subsystem_id, feature_id, title, description, status, priority,
         start_date, completion_date, created_at, updated_at, as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.system_id, NEW.subsystem_id, NEW.feature_id, NEW.title, NEW.description,
         NEW.status, NEW.priority, NEW.start_date, NEW.completion_date,
         OLD.created_at, NOW(), NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, system_id, subsystem_id, feature_id,
              title, description, status, priority,
              start_date, completion_date, created_at, updated_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_requirements_update
    INSTEAD OF UPDATE ON nebula.requirements
    FOR EACH ROW EXECUTE FUNCTION nebula.requirements_update_trigger();

CREATE OR REPLACE FUNCTION nebula.requirements_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.requirements_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_requirements_delete
    INSTEAD OF DELETE ON nebula.requirements
    FOR EACH ROW EXECUTE FUNCTION nebula.requirements_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  5. system_folders
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE nebula.system_folders RENAME TO system_folders_history;

ALTER TABLE nebula.system_folders_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.system_folders_history DROP CONSTRAINT system_folders_pkey;
ALTER TABLE nebula.system_folders_history ADD PRIMARY KEY (id, as_of_dt);

UPDATE nebula.system_folders_history
SET    as_of_dt = NOW(),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_folders_history_active
    ON nebula.system_folders_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_folders_history_system
    ON nebula.system_folders_history (system_id);

CREATE OR REPLACE VIEW nebula.system_folders AS
SELECT id, system_id, name, category, note
FROM   nebula.system_folders_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.system_folders_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.system_folders_history (id, system_id, name, category, note, as_of_dt, expiration_dt)
    VALUES (new_id, NEW.system_id, NEW.name, NEW.category, NEW.note, NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_folders_insert
    INSTEAD OF INSERT ON nebula.system_folders
    FOR EACH ROW EXECUTE FUNCTION nebula.system_folders_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.system_folders_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.system_folders_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.system_folders_history (id, system_id, name, category, note, as_of_dt, expiration_dt)
    VALUES (OLD.id, NEW.system_id, NEW.name, NEW.category, NEW.note, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, system_id, name, category, note INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_folders_update
    INSTEAD OF UPDATE ON nebula.system_folders
    FOR EACH ROW EXECUTE FUNCTION nebula.system_folders_update_trigger();

CREATE OR REPLACE FUNCTION nebula.system_folders_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.system_folders_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_folders_delete
    INSTEAD OF DELETE ON nebula.system_folders
    FOR EACH ROW EXECUTE FUNCTION nebula.system_folders_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  6. work_sessions
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_work_sessions_updated_at ON nebula.work_sessions;

ALTER TABLE nebula.work_sessions RENAME TO work_sessions_history;

ALTER TABLE nebula.work_sessions_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.work_sessions_history DROP CONSTRAINT work_sessions_pkey;
ALTER TABLE nebula.work_sessions_history ADD PRIMARY KEY (id, as_of_dt);

UPDATE nebula.work_sessions_history
SET    as_of_dt = COALESCE(created_at, NOW()),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_sessions_history_active
    ON nebula.work_sessions_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW nebula.work_sessions AS
SELECT id, parent_id, parent_type, parent_name,
       context, platform, model, outcome, status,
       created_at, updated_at
FROM   nebula.work_sessions_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.work_sessions_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.work_sessions_history
        (id, parent_id, parent_type, parent_name, context, platform, model, outcome, status,
         created_at, updated_at, as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.parent_id, NEW.parent_type, NEW.parent_name, NEW.context, NEW.platform,
         NEW.model, NEW.outcome, NEW.status,
         COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_sessions_insert
    INSTEAD OF INSERT ON nebula.work_sessions
    FOR EACH ROW EXECUTE FUNCTION nebula.work_sessions_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.work_sessions_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.work_sessions_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.work_sessions_history
        (id, parent_id, parent_type, parent_name, context, platform, model, outcome, status,
         created_at, updated_at, as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.parent_id, NEW.parent_type, NEW.parent_name, NEW.context, NEW.platform,
         NEW.model, NEW.outcome, NEW.status,
         OLD.created_at, NOW(), NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, parent_id, parent_type, parent_name,
              context, platform, model, outcome, status,
              created_at, updated_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_sessions_update
    INSTEAD OF UPDATE ON nebula.work_sessions
    FOR EACH ROW EXECUTE FUNCTION nebula.work_sessions_update_trigger();

CREATE OR REPLACE FUNCTION nebula.work_sessions_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.work_sessions_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_sessions_delete
    INSTEAD OF DELETE ON nebula.work_sessions
    FOR EACH ROW EXECUTE FUNCTION nebula.work_sessions_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  7. system_workspaces
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE nebula.system_workspaces RENAME TO system_workspaces_history;

ALTER TABLE nebula.system_workspaces_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.system_workspaces_history DROP CONSTRAINT system_workspaces_pkey;
ALTER TABLE nebula.system_workspaces_history ADD PRIMARY KEY (id, as_of_dt);

UPDATE nebula.system_workspaces_history
SET    as_of_dt = COALESCE(created_at, NOW()),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_workspaces_history_active
    ON nebula.system_workspaces_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_workspaces_history_system
    ON nebula.system_workspaces_history (system_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_history_subsystem
    ON nebula.system_workspaces_history (subsystem_id);

CREATE OR REPLACE VIEW nebula.system_workspaces AS
SELECT id, system_id, subsystem_id, workspace_path, created_at
FROM   nebula.system_workspaces_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.system_workspaces_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.system_workspaces_history (id, system_id, subsystem_id, workspace_path, created_at, as_of_dt, expiration_dt)
    VALUES (new_id, NEW.system_id, NEW.subsystem_id, NEW.workspace_path, COALESCE(NEW.created_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_workspaces_insert
    INSTEAD OF INSERT ON nebula.system_workspaces
    FOR EACH ROW EXECUTE FUNCTION nebula.system_workspaces_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.system_workspaces_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.system_workspaces_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.system_workspaces_history (id, system_id, subsystem_id, workspace_path, created_at, as_of_dt, expiration_dt)
    VALUES (OLD.id, NEW.system_id, NEW.subsystem_id, NEW.workspace_path, OLD.created_at, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, system_id, subsystem_id, workspace_path, created_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_workspaces_update
    INSTEAD OF UPDATE ON nebula.system_workspaces
    FOR EACH ROW EXECUTE FUNCTION nebula.system_workspaces_update_trigger();

CREATE OR REPLACE FUNCTION nebula.system_workspaces_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.system_workspaces_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_workspaces_delete
    INSTEAD OF DELETE ON nebula.system_workspaces
    FOR EACH ROW EXECUTE FUNCTION nebula.system_workspaces_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  8. user_preferences
--     PK: (user_id, key) — no UUID id column
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_user_preferences_updated_at ON nebula.user_preferences;

ALTER TABLE nebula.user_preferences RENAME TO user_preferences_history;

ALTER TABLE nebula.user_preferences_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.user_preferences_history DROP CONSTRAINT user_preferences_pkey;
ALTER TABLE nebula.user_preferences_history ADD PRIMARY KEY (user_id, key, as_of_dt);

UPDATE nebula.user_preferences_history
SET    as_of_dt = NOW(),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_preferences_history_active
    ON nebula.user_preferences_history (user_id, key, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW nebula.user_preferences AS
SELECT user_id, key, value, updated_at
FROM   nebula.user_preferences_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.user_preferences_insert_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO nebula.user_preferences_history (user_id, key, value, updated_at, as_of_dt, expiration_dt)
    VALUES (NEW.user_id, NEW.key, NEW.value, COALESCE(NEW.updated_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_preferences_insert
    INSTEAD OF INSERT ON nebula.user_preferences
    FOR EACH ROW EXECUTE FUNCTION nebula.user_preferences_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.user_preferences_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.user_preferences_history
    SET    expiration_dt = NOW()
    WHERE  user_id = OLD.user_id AND key = OLD.key
       AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.user_preferences_history (user_id, key, value, updated_at, as_of_dt, expiration_dt)
    VALUES (OLD.user_id, OLD.key, NEW.value, NOW(), NOW(), '9999-12-31 23:59:59+00')
    RETURNING user_id, key, value, updated_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_preferences_update
    INSTEAD OF UPDATE ON nebula.user_preferences
    FOR EACH ROW EXECUTE FUNCTION nebula.user_preferences_update_trigger();

CREATE OR REPLACE FUNCTION nebula.user_preferences_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.user_preferences_history
    SET    expiration_dt = NOW()
    WHERE  user_id = OLD.user_id AND key = OLD.key
       AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_preferences_delete
    INSTEAD OF DELETE ON nebula.user_preferences
    FOR EACH ROW EXECUTE FUNCTION nebula.user_preferences_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  9. audit_files
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_audit_files_updated_at ON nebula.audit_files;

ALTER TABLE nebula.audit_files RENAME TO audit_files_history;

ALTER TABLE nebula.audit_files_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.audit_files_history DROP CONSTRAINT audit_files_pkey;
ALTER TABLE nebula.audit_files_history ADD PRIMARY KEY (id, as_of_dt);

-- The UNIQUE constraint on file_path must be dropped for history
ALTER TABLE nebula.audit_files_history DROP CONSTRAINT IF EXISTS audit_files_file_path_key;

UPDATE nebula.audit_files_history
SET    as_of_dt = NOW(),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_audit_files_history_active
    ON nebula.audit_files_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_audit_files_history_path
    ON nebula.audit_files_history (file_path);

CREATE OR REPLACE VIEW nebula.audit_files AS
SELECT id, file_path, content, size_bytes, updated_at
FROM   nebula.audit_files_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.audit_files_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.audit_files_history (id, file_path, content, size_bytes, updated_at, as_of_dt, expiration_dt)
    VALUES (new_id, NEW.file_path, NEW.content, NEW.size_bytes, COALESCE(NEW.updated_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_files_insert
    INSTEAD OF INSERT ON nebula.audit_files
    FOR EACH ROW EXECUTE FUNCTION nebula.audit_files_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.audit_files_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.audit_files_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.audit_files_history (id, file_path, content, size_bytes, updated_at, as_of_dt, expiration_dt)
    VALUES (OLD.id, NEW.file_path, NEW.content, NEW.size_bytes, NOW(), NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, file_path, content, size_bytes, updated_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_files_update
    INSTEAD OF UPDATE ON nebula.audit_files
    FOR EACH ROW EXECUTE FUNCTION nebula.audit_files_update_trigger();

CREATE OR REPLACE FUNCTION nebula.audit_files_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.audit_files_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_files_delete
    INSTEAD OF DELETE ON nebula.audit_files
    FOR EACH ROW EXECUTE FUNCTION nebula.audit_files_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  10. system_info_tabs
--      PK: (system_id, tab_id)
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_system_info_tabs_updated_at ON nebula.system_info_tabs;

ALTER TABLE nebula.system_info_tabs RENAME TO system_info_tabs_history;

ALTER TABLE nebula.system_info_tabs_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.system_info_tabs_history DROP CONSTRAINT system_info_tabs_pkey;
ALTER TABLE nebula.system_info_tabs_history ADD PRIMARY KEY (system_id, tab_id, as_of_dt);

UPDATE nebula.system_info_tabs_history
SET    as_of_dt = NOW(),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_info_tabs_history_active
    ON nebula.system_info_tabs_history (system_id, tab_id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW nebula.system_info_tabs AS
SELECT system_id, tab_id, content, updated_at
FROM   nebula.system_info_tabs_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.system_info_tabs_insert_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO nebula.system_info_tabs_history (system_id, tab_id, content, updated_at, as_of_dt, expiration_dt)
    VALUES (NEW.system_id, NEW.tab_id, NEW.content, COALESCE(NEW.updated_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_info_tabs_insert
    INSTEAD OF INSERT ON nebula.system_info_tabs
    FOR EACH ROW EXECUTE FUNCTION nebula.system_info_tabs_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.system_info_tabs_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.system_info_tabs_history
    SET    expiration_dt = NOW()
    WHERE  system_id = OLD.system_id AND tab_id = OLD.tab_id
       AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.system_info_tabs_history (system_id, tab_id, content, updated_at, as_of_dt, expiration_dt)
    VALUES (OLD.system_id, OLD.tab_id, NEW.content, NOW(), NOW(), '9999-12-31 23:59:59+00')
    RETURNING system_id, tab_id, content, updated_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_info_tabs_update
    INSTEAD OF UPDATE ON nebula.system_info_tabs
    FOR EACH ROW EXECUTE FUNCTION nebula.system_info_tabs_update_trigger();

CREATE OR REPLACE FUNCTION nebula.system_info_tabs_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.system_info_tabs_history
    SET    expiration_dt = NOW()
    WHERE  system_id = OLD.system_id AND tab_id = OLD.tab_id
       AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_info_tabs_delete
    INSTEAD OF DELETE ON nebula.system_info_tabs
    FOR EACH ROW EXECUTE FUNCTION nebula.system_info_tabs_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  11. harvests
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_harvests_updated_at ON nebula.harvests;

ALTER TABLE nebula.harvests RENAME TO harvests_history;

ALTER TABLE nebula.harvests_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.harvests_history DROP CONSTRAINT harvests_pkey;
ALTER TABLE nebula.harvests_history ADD PRIMARY KEY (id, as_of_dt);

UPDATE nebula.harvests_history
SET    as_of_dt = COALESCE(created_at, NOW()),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_harvests_history_active
    ON nebula.harvests_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW nebula.harvests AS
SELECT id, source_path, source_filename, model, total_candidates,
       candidates, source_text, tags, metadata, created_at, updated_at
FROM   nebula.harvests_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.harvests_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.harvests_history
        (id, source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, created_at, updated_at,
         as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.source_path, NEW.source_filename, NEW.model, NEW.total_candidates,
         NEW.candidates, NEW.source_text, NEW.tags, NEW.metadata,
         COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_harvests_insert
    INSTEAD OF INSERT ON nebula.harvests
    FOR EACH ROW EXECUTE FUNCTION nebula.harvests_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.harvests_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.harvests_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.harvests_history
        (id, source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, created_at, updated_at,
         as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.source_path, NEW.source_filename, NEW.model, NEW.total_candidates,
         NEW.candidates, NEW.source_text, NEW.tags, NEW.metadata,
         OLD.created_at, NOW(), NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, source_path, source_filename, model, total_candidates,
              candidates, source_text, tags, metadata, created_at, updated_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_harvests_update
    INSTEAD OF UPDATE ON nebula.harvests
    FOR EACH ROW EXECUTE FUNCTION nebula.harvests_update_trigger();

CREATE OR REPLACE FUNCTION nebula.harvests_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.harvests_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_harvests_delete
    INSTEAD OF DELETE ON nebula.harvests
    FOR EACH ROW EXECUTE FUNCTION nebula.harvests_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  12. agent_records
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_agent_records_updated_at ON nebula.agent_records;

ALTER TABLE nebula.agent_records RENAME TO agent_records_history;

ALTER TABLE nebula.agent_records_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.agent_records_history DROP CONSTRAINT agent_records_pkey;
ALTER TABLE nebula.agent_records_history ADD PRIMARY KEY (id, as_of_dt);

UPDATE nebula.agent_records_history
SET    as_of_dt = COALESCE(created_at, NOW()),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_agent_records_history_active
    ON nebula.agent_records_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW nebula.agent_records AS
SELECT id, record_type, role, title, content, source_path,
       metadata, tags, system_id, subsystem_id, feature_id,
       plan_ref, created_at, updated_at
FROM   nebula.agent_records_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.agent_records_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.agent_records_history
        (id, record_type, role, title, content, source_path,
         metadata, tags, system_id, subsystem_id, feature_id,
         plan_ref, created_at, updated_at, as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.record_type, NEW.role, NEW.title, NEW.content, NEW.source_path,
         NEW.metadata, NEW.tags, NEW.system_id, NEW.subsystem_id, NEW.feature_id,
         NEW.plan_ref, COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_records_insert
    INSTEAD OF INSERT ON nebula.agent_records
    FOR EACH ROW EXECUTE FUNCTION nebula.agent_records_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.agent_records_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.agent_records_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.agent_records_history
        (id, record_type, role, title, content, source_path,
         metadata, tags, system_id, subsystem_id, feature_id,
         plan_ref, created_at, updated_at, as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.record_type, NEW.role, NEW.title, NEW.content, NEW.source_path,
         NEW.metadata, NEW.tags, NEW.system_id, NEW.subsystem_id, NEW.feature_id,
         NEW.plan_ref, OLD.created_at, NOW(), NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, record_type, role, title, content, source_path,
              metadata, tags, system_id, subsystem_id, feature_id,
              plan_ref, created_at, updated_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_records_update
    INSTEAD OF UPDATE ON nebula.agent_records
    FOR EACH ROW EXECUTE FUNCTION nebula.agent_records_update_trigger();

CREATE OR REPLACE FUNCTION nebula.agent_records_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.agent_records_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_records_delete
    INSTEAD OF DELETE ON nebula.agent_records
    FOR EACH ROW EXECUTE FUNCTION nebula.agent_records_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  13. projections
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_projections_updated_at ON nebula.projections;

ALTER TABLE nebula.projections RENAME TO projections_history;

ALTER TABLE nebula.projections_history
    ADD COLUMN as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN expiration_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE nebula.projections_history DROP CONSTRAINT projections_pkey;
ALTER TABLE nebula.projections_history ADD PRIMARY KEY (id, as_of_dt);

-- Drop the UNIQUE constraint on name for the history table
ALTER TABLE nebula.projections_history DROP CONSTRAINT IF EXISTS projections_name_key;

UPDATE nebula.projections_history
SET    as_of_dt = COALESCE(created_at, NOW()),
       expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_projections_history_active
    ON nebula.projections_history (id, expiration_dt DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW nebula.projections AS
SELECT id, name, type, description, source_query, template,
       target_path, model, schedule, metadata, created_at, updated_at
FROM   nebula.projections_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

CREATE OR REPLACE FUNCTION nebula.projections_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.projections_history
        (id, name, type, description, source_query, template,
         target_path, model, schedule, metadata, created_at, updated_at,
         as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.name, NEW.type, NEW.description, NEW.source_query, NEW.template,
         NEW.target_path, NEW.model, NEW.schedule, NEW.metadata,
         COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projections_insert
    INSTEAD OF INSERT ON nebula.projections
    FOR EACH ROW EXECUTE FUNCTION nebula.projections_insert_trigger();

CREATE OR REPLACE FUNCTION nebula.projections_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.projections_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.projections_history
        (id, name, type, description, source_query, template,
         target_path, model, schedule, metadata, created_at, updated_at,
         as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.name, NEW.type, NEW.description, NEW.source_query, NEW.template,
         NEW.target_path, NEW.model, NEW.schedule, NEW.metadata,
         OLD.created_at, NOW(), NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, name, type, description, source_query, template,
              target_path, model, schedule, metadata, created_at, updated_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projections_update
    INSTEAD OF UPDATE ON nebula.projections
    FOR EACH ROW EXECUTE FUNCTION nebula.projections_update_trigger();

CREATE OR REPLACE FUNCTION nebula.projections_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.projections_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projections_delete
    INSTEAD OF DELETE ON nebula.projections
    FOR EACH ROW EXECUTE FUNCTION nebula.projections_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  PARTIAL UNIQUE INDEXES (active-only uniqueness)
--  These ensure UNIQUE constraints still hold for active rows, even
--  though the _history tables allow multiple versions.
-- ═══════════════════════════════════════════════════════════════════════

-- audit_files: file_path must be unique among active rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_files_active_path
    ON nebula.audit_files_history (file_path)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- projections: name must be unique among active rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_projections_active_name
    ON nebula.projections_history (name)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- requirements: enforce id uniqueness among active rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_requirements_active_id
    ON nebula.requirements_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- All entity tables: id must be unique among active rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_systems_active_id
    ON nebula.systems_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_subsystems_active_id
    ON nebula.subsystems_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_features_active_id
    ON nebula.features_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_active_id
    ON nebula.system_folders_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_id
    ON nebula.work_sessions_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_active_id
    ON nebula.system_workspaces_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_harvests_active_id
    ON nebula.harvests_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_records_active_id
    ON nebula.agent_records_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_projections_active_id
    ON nebula.projections_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- user_preferences: (user_id, key) must be unique among active rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_active_pk
    ON nebula.user_preferences_history (user_id, key)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- system_info_tabs: (system_id, tab_id) must be unique among active rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_info_tabs_active_pk
    ON nebula.system_info_tabs_history (system_id, tab_id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- ═══════════════════════════════════════════════════════════════════════
--  COMPATIBILITY FIXES — modifications needed in routes.ts
--  Two SQL patterns break with the view + INSTEAD OF trigger approach.
--  Apply these fixes to nebula-srv/src/routes.ts after running the
--  migration.
-- ═══════════════════════════════════════════════════════════════════════

-- ── FIX 1: SELECT ... FOR UPDATE — query _history table directly ─────
-- In POST /api/requirements/:id/move (kanban), replace:
--   SELECT id, status FROM requirements WHERE id = $1 FOR UPDATE
-- with:
--   SELECT id, status FROM nebula.requirements_history
--   WHERE id = $1
--     AND NOW() >= as_of_dt AND NOW() < expiration_dt
--   FOR UPDATE

-- ── FIX 2: INSERT ... ON CONFLICT — use _history table directly ──────
-- In POST /api/import, replace ON CONFLICT patterns with:
--   INSERT INTO nebula.{table}_history (...) VALUES (...)
--   ON CONFLICT (id, as_of_dt) DO NOTHING
-- (Note: as_of_dt is part of the PK, so every insert has a unique PK.)

-- In PUT /api/preferences/:key, replace:
--   INSERT INTO user_preferences ... ON CONFLICT (user_id, key) DO UPDATE
-- with a direct upsert against the _history table:
--
--   DO $$
--   BEGIN
--     UPDATE nebula.user_preferences_history
--     SET    expiration_dt = NOW()
--     WHERE  user_id = 'default' AND key = $1
--       AND  expiration_dt = '9999-12-31 23:59:59+00';
--
--     INSERT INTO nebula.user_preferences_history (user_id, key, value, updated_at, as_of_dt, expiration_dt)
--     VALUES ('default', $1, $2, NOW(), NOW(), '9999-12-31 23:59:59+00');
--   END $$;

-- Same pattern for PUT /api/systems/:id/info/:tabId and
-- POST /api/audit/sync (INSERT ... ON CONFLICT (file_path) DO UPDATE).

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_count INTEGER;
BEGIN
    -- Ensure views resolve correctly (lookups against the _history tables work)
    SELECT COUNT(*) INTO v_count FROM nebula.systems;
    RAISE NOTICE 'Active systems: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.subsystems;
    RAISE NOTICE 'Active subsystems: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.features;
    RAISE NOTICE 'Active features: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.requirements;
    RAISE NOTICE 'Active requirements: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.system_folders;
    RAISE NOTICE 'Active system_folders: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.work_sessions;
    RAISE NOTICE 'Active work_sessions: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.system_workspaces;
    RAISE NOTICE 'Active system_workspaces: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.user_preferences;
    RAISE NOTICE 'Active user_preferences: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.audit_files;
    RAISE NOTICE 'Active audit_files: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.system_info_tabs;
    RAISE NOTICE 'Active system_info_tabs: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.harvests;
    RAISE NOTICE 'Active harvests: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.agent_records;
    RAISE NOTICE 'Active agent_records: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.projections;
    RAISE NOTICE 'Active projections: %', v_count;

    RAISE NOTICE 'SCD Type 4 migration complete — all 13 tables migrated.';
    RAISE NOTICE 'History tables: nebula.{table}_history';
    RAISE NOTICE 'Active views:   nebula.{table} (app code unchanged)';
END $$;

COMMIT;

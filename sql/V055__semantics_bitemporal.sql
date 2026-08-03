-- ═══════════════════════════════════════════════════════════════════════
--  V055 — semantics schema → SCD Type 4 bitemporal (nebula pattern)
--
--  Follows nebula's canonical bitemporal upgrade: base table → {table}_history
--  with recorded_on_dt / recorded_until_dt (system time) and
--  valid_from / valid_until (valid/business time).
--
--    INSERT:  valid_from defaults NOW(), valid_until to sentinel
--    UPDATE:  valid_from/valid_until carried forward from old row
--    DELETE:  system-time expire only (soft delete), valid time unchanged
--
--  View filter: NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
--               AND NOW() >= valid_from AND NOW() < valid_until
--
--  FK constraints are dropped (app-layer integrity) — same decision as
--  nebula's scd-type4-temporal.sql. UNIQUE constraints move to partial
--  unique indexes over active rows only.
--
--  Usage:  psql -h localhost -U pguser -d nexus -f V055__semantics_bitemporal.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  PHASE 0 — Drop all FK constraints in the semantics schema
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
        AND    nsp.nspname = 'semantics'
    LOOP
        EXECUTE format('ALTER TABLE semantics.%I DROP CONSTRAINT %I',
                       rec.table_name, rec.constraint_name);
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  owning_subsystem
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.owning_subsystem RENAME TO owning_subsystem_history;

ALTER TABLE semantics.owning_subsystem_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.owning_subsystem_history DROP CONSTRAINT owning_subsystem_pkey;
ALTER TABLE semantics.owning_subsystem_history ADD PRIMARY KEY (id, recorded_on_dt);

ALTER TABLE semantics.owning_subsystem_history DROP CONSTRAINT IF EXISTS owning_subsystem_name_key;

UPDATE semantics.owning_subsystem_history
SET    recorded_on_dt   = NOW(),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = NOW(),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_owning_subsystem_active_id
    ON semantics.owning_subsystem_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';
CREATE UNIQUE INDEX IF NOT EXISTS idx_owning_subsystem_active_name
    ON semantics.owning_subsystem_history (name)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.owning_subsystem AS
SELECT id, name, description,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.owning_subsystem_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.owning_subsystem_insert_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO semantics.owning_subsystem_history
        (id, name, description,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (NEW.id, NEW.name, NEW.description,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_owning_subsystem_insert
    INSTEAD OF INSERT ON semantics.owning_subsystem
    FOR EACH ROW EXECUTE FUNCTION semantics.owning_subsystem_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.owning_subsystem_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.owning_subsystem_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.owning_subsystem_history
        (id, name, description,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.name, NEW.description,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, name, description,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_owning_subsystem_update
    INSTEAD OF UPDATE ON semantics.owning_subsystem
    FOR EACH ROW EXECUTE FUNCTION semantics.owning_subsystem_update_trigger();

CREATE OR REPLACE FUNCTION semantics.owning_subsystem_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.owning_subsystem_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_owning_subsystem_delete
    INSTEAD OF DELETE ON semantics.owning_subsystem
    FOR EACH ROW EXECUTE FUNCTION semantics.owning_subsystem_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_owning_subsystem(
    p_id smallint DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.owning_subsystem AS $$
DECLARE
    v_row semantics.owning_subsystem%ROWTYPE;
BEGIN
    INSERT INTO semantics.owning_subsystem (id, name, description, valid_from, valid_until)
    VALUES (p_id, p_name, p_description, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_owning_subsystem(p_id smallint)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.owning_subsystem_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  concept
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.concept RENAME TO concept_history;

ALTER TABLE semantics.concept_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.concept_history DROP CONSTRAINT concept_pkey;
ALTER TABLE semantics.concept_history ADD PRIMARY KEY (id, recorded_on_dt);

ALTER TABLE semantics.concept_history DROP CONSTRAINT IF EXISTS concept_name_key;

UPDATE semantics.concept_history
SET    recorded_on_dt   = COALESCE(created_at, NOW()),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = COALESCE(created_at, NOW()),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_active_id
    ON semantics.concept_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';
CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_active_name
    ON semantics.concept_history (name)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.concept AS
SELECT id, name, description, created_at, expired_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.concept_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.concept_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.concept_history
        (id, name, description, created_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.name, NEW.description, COALESCE(NEW.created_at, NOW()), NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_concept_insert
    INSTEAD OF INSERT ON semantics.concept
    FOR EACH ROW EXECUTE FUNCTION semantics.concept_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.concept_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.concept_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.concept_history
        (id, name, description, created_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.name, NEW.description, OLD.created_at, NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, name, description, created_at, expired_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_concept_update
    INSTEAD OF UPDATE ON semantics.concept
    FOR EACH ROW EXECUTE FUNCTION semantics.concept_update_trigger();

CREATE OR REPLACE FUNCTION semantics.concept_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.concept_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_concept_delete
    INSTEAD OF DELETE ON semantics.concept
    FOR EACH ROW EXECUTE FUNCTION semantics.concept_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_concept(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.concept AS $$
DECLARE
    v_row semantics.concept%ROWTYPE;
BEGIN
    INSERT INTO semantics.concept (id, name, description, expired_at, valid_from, valid_until)
    VALUES (p_id, p_name, p_description, p_expired_at, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_concept(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.concept_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  representation
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.representation RENAME TO representation_history;

ALTER TABLE semantics.representation_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.representation_history DROP CONSTRAINT representation_pkey;
ALTER TABLE semantics.representation_history ADD PRIMARY KEY (id, recorded_on_dt);


UPDATE semantics.representation_history
SET    recorded_on_dt   = COALESCE(created_at, NOW()),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = COALESCE(created_at, NOW()),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_representation_active_id
    ON semantics.representation_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.representation AS
SELECT id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.representation_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.representation_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.representation_history
        (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.concept_id, NEW.label, NEW.schema_name, NEW.table_name, NEW.owning_subsystem_id, NEW.owner, NEW.raw_metadata, COALESCE(NEW.created_at, NOW()), NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_representation_insert
    INSTEAD OF INSERT ON semantics.representation
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.representation_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.representation_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.representation_history
        (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.concept_id, NEW.label, NEW.schema_name, NEW.table_name, NEW.owning_subsystem_id, NEW.owner, NEW.raw_metadata, OLD.created_at, NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_representation_update
    INSTEAD OF UPDATE ON semantics.representation
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_update_trigger();

CREATE OR REPLACE FUNCTION semantics.representation_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.representation_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_representation_delete
    INSTEAD OF DELETE ON semantics.representation
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_representation(
    p_id uuid DEFAULT NULL,
    p_concept_id uuid DEFAULT NULL,
    p_label text DEFAULT NULL,
    p_schema_name text DEFAULT NULL,
    p_table_name text DEFAULT NULL,
    p_owning_subsystem_id smallint DEFAULT NULL,
    p_owner text DEFAULT NULL,
    p_raw_metadata jsonb DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.representation AS $$
DECLARE
    v_row semantics.representation%ROWTYPE;
BEGIN
    INSERT INTO semantics.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, expired_at, valid_from, valid_until)
    VALUES (p_id, p_concept_id, p_label, p_schema_name, p_table_name, p_owning_subsystem_id, p_owner, p_raw_metadata, p_expired_at, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_representation(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.representation_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  representation_relationship
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.representation_relationship RENAME TO representation_relationship_history;

ALTER TABLE semantics.representation_relationship_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.representation_relationship_history DROP CONSTRAINT representation_relationship_pkey;
ALTER TABLE semantics.representation_relationship_history ADD PRIMARY KEY (id, recorded_on_dt);


UPDATE semantics.representation_relationship_history
SET    recorded_on_dt   = NOW(),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = NOW(),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_representation_relationship_active_id
    ON semantics.representation_relationship_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.representation_relationship AS
SELECT id, from_representation_id, to_representation_id, relationship_type, notes, effective_at, expired_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.representation_relationship_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.representation_relationship_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.representation_relationship_history
        (id, from_representation_id, to_representation_id, relationship_type, notes, effective_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.from_representation_id, NEW.to_representation_id, NEW.relationship_type, NEW.notes, NEW.effective_at, NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_representation_relationship_insert
    INSTEAD OF INSERT ON semantics.representation_relationship
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_relationship_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.representation_relationship_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.representation_relationship_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.representation_relationship_history
        (id, from_representation_id, to_representation_id, relationship_type, notes, effective_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.from_representation_id, NEW.to_representation_id, NEW.relationship_type, NEW.notes, NEW.effective_at, NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, from_representation_id, to_representation_id, relationship_type, notes, effective_at, expired_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_representation_relationship_update
    INSTEAD OF UPDATE ON semantics.representation_relationship
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_relationship_update_trigger();

CREATE OR REPLACE FUNCTION semantics.representation_relationship_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.representation_relationship_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_representation_relationship_delete
    INSTEAD OF DELETE ON semantics.representation_relationship
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_relationship_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_representation_relationship(
    p_id uuid DEFAULT NULL,
    p_from_representation_id uuid DEFAULT NULL,
    p_to_representation_id uuid DEFAULT NULL,
    p_relationship_type text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_effective_at timestamptz DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.representation_relationship AS $$
DECLARE
    v_row semantics.representation_relationship%ROWTYPE;
BEGIN
    INSERT INTO semantics.representation_relationship (id, from_representation_id, to_representation_id, relationship_type, notes, effective_at, expired_at, valid_from, valid_until)
    VALUES (p_id, p_from_representation_id, p_to_representation_id, p_relationship_type, p_notes, p_effective_at, p_expired_at, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_representation_relationship(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.representation_relationship_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  consumer_operation
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.consumer_operation RENAME TO consumer_operation_history;

ALTER TABLE semantics.consumer_operation_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.consumer_operation_history DROP CONSTRAINT consumer_operation_pkey;
ALTER TABLE semantics.consumer_operation_history ADD PRIMARY KEY (id, recorded_on_dt);


UPDATE semantics.consumer_operation_history
SET    recorded_on_dt   = NOW(),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = NOW(),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_consumer_operation_active_id
    ON semantics.consumer_operation_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.consumer_operation AS
SELECT id, representation_id, consumer_name, operation, notes, effective_at, expired_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.consumer_operation_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.consumer_operation_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.consumer_operation_history
        (id, representation_id, consumer_name, operation, notes, effective_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.representation_id, NEW.consumer_name, NEW.operation, NEW.notes, NEW.effective_at, NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_consumer_operation_insert
    INSTEAD OF INSERT ON semantics.consumer_operation
    FOR EACH ROW EXECUTE FUNCTION semantics.consumer_operation_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.consumer_operation_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.consumer_operation_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.consumer_operation_history
        (id, representation_id, consumer_name, operation, notes, effective_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.representation_id, NEW.consumer_name, NEW.operation, NEW.notes, NEW.effective_at, NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, representation_id, consumer_name, operation, notes, effective_at, expired_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_consumer_operation_update
    INSTEAD OF UPDATE ON semantics.consumer_operation
    FOR EACH ROW EXECUTE FUNCTION semantics.consumer_operation_update_trigger();

CREATE OR REPLACE FUNCTION semantics.consumer_operation_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.consumer_operation_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_consumer_operation_delete
    INSTEAD OF DELETE ON semantics.consumer_operation
    FOR EACH ROW EXECUTE FUNCTION semantics.consumer_operation_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_consumer_operation(
    p_id uuid DEFAULT NULL,
    p_representation_id uuid DEFAULT NULL,
    p_consumer_name text DEFAULT NULL,
    p_operation text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_effective_at timestamptz DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.consumer_operation AS $$
DECLARE
    v_row semantics.consumer_operation%ROWTYPE;
BEGIN
    INSERT INTO semantics.consumer_operation (id, representation_id, consumer_name, operation, notes, effective_at, expired_at, valid_from, valid_until)
    VALUES (p_id, p_representation_id, p_consumer_name, p_operation, p_notes, p_effective_at, p_expired_at, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_consumer_operation(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.consumer_operation_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  identity_strategy
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.identity_strategy RENAME TO identity_strategy_history;

ALTER TABLE semantics.identity_strategy_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.identity_strategy_history DROP CONSTRAINT identity_strategy_pkey;
ALTER TABLE semantics.identity_strategy_history ADD PRIMARY KEY (id, recorded_on_dt);

ALTER TABLE semantics.identity_strategy_history DROP CONSTRAINT IF EXISTS identity_strategy_concept_id_key;

UPDATE semantics.identity_strategy_history
SET    recorded_on_dt   = NOW(),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = NOW(),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_strategy_active_id
    ON semantics.identity_strategy_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_strategy_active_concept_id
    ON semantics.identity_strategy_history (concept_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.identity_strategy AS
SELECT id, concept_id, canonical_key_description, notes,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.identity_strategy_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.identity_strategy_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.identity_strategy_history
        (id, concept_id, canonical_key_description, notes,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.concept_id, NEW.canonical_key_description, NEW.notes,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_identity_strategy_insert
    INSTEAD OF INSERT ON semantics.identity_strategy
    FOR EACH ROW EXECUTE FUNCTION semantics.identity_strategy_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.identity_strategy_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.identity_strategy_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.identity_strategy_history
        (id, concept_id, canonical_key_description, notes,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.concept_id, NEW.canonical_key_description, NEW.notes,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, concept_id, canonical_key_description, notes,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_identity_strategy_update
    INSTEAD OF UPDATE ON semantics.identity_strategy
    FOR EACH ROW EXECUTE FUNCTION semantics.identity_strategy_update_trigger();

CREATE OR REPLACE FUNCTION semantics.identity_strategy_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.identity_strategy_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_identity_strategy_delete
    INSTEAD OF DELETE ON semantics.identity_strategy
    FOR EACH ROW EXECUTE FUNCTION semantics.identity_strategy_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_identity_strategy(
    p_id uuid DEFAULT NULL,
    p_concept_id uuid DEFAULT NULL,
    p_canonical_key_description text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.identity_strategy AS $$
DECLARE
    v_row semantics.identity_strategy%ROWTYPE;
BEGIN
    INSERT INTO semantics.identity_strategy (id, concept_id, canonical_key_description, notes, valid_from, valid_until)
    VALUES (p_id, p_concept_id, p_canonical_key_description, p_notes, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_identity_strategy(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.identity_strategy_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  representation_identity
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.representation_identity RENAME TO representation_identity_history;

ALTER TABLE semantics.representation_identity_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.representation_identity_history DROP CONSTRAINT representation_identity_pkey;
ALTER TABLE semantics.representation_identity_history ADD PRIMARY KEY (id, recorded_on_dt);

ALTER TABLE semantics.representation_identity_history DROP CONSTRAINT IF EXISTS representation_identity_representation_id_key;

UPDATE semantics.representation_identity_history
SET    recorded_on_dt   = NOW(),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = NOW(),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_representation_identity_active_id
    ON semantics.representation_identity_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';
CREATE UNIQUE INDEX IF NOT EXISTS idx_representation_identity_active_representation_id
    ON semantics.representation_identity_history (representation_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.representation_identity AS
SELECT id, representation_id, identity_strategy_id, identity_expression, notes,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.representation_identity_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.representation_identity_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.representation_identity_history
        (id, representation_id, identity_strategy_id, identity_expression, notes,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.representation_id, NEW.identity_strategy_id, NEW.identity_expression, NEW.notes,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_representation_identity_insert
    INSTEAD OF INSERT ON semantics.representation_identity
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_identity_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.representation_identity_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.representation_identity_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.representation_identity_history
        (id, representation_id, identity_strategy_id, identity_expression, notes,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.representation_id, NEW.identity_strategy_id, NEW.identity_expression, NEW.notes,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, representation_id, identity_strategy_id, identity_expression, notes,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_representation_identity_update
    INSTEAD OF UPDATE ON semantics.representation_identity
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_identity_update_trigger();

CREATE OR REPLACE FUNCTION semantics.representation_identity_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.representation_identity_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_representation_identity_delete
    INSTEAD OF DELETE ON semantics.representation_identity
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_identity_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_representation_identity(
    p_id uuid DEFAULT NULL,
    p_representation_id uuid DEFAULT NULL,
    p_identity_strategy_id uuid DEFAULT NULL,
    p_identity_expression text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.representation_identity AS $$
DECLARE
    v_row semantics.representation_identity%ROWTYPE;
BEGIN
    INSERT INTO semantics.representation_identity (id, representation_id, identity_strategy_id, identity_expression, notes, valid_from, valid_until)
    VALUES (p_id, p_representation_id, p_identity_strategy_id, p_identity_expression, p_notes, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_representation_identity(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.representation_identity_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  snapshot
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.snapshot RENAME TO snapshot_history;

ALTER TABLE semantics.snapshot_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.snapshot_history DROP CONSTRAINT snapshot_pkey;
ALTER TABLE semantics.snapshot_history ADD PRIMARY KEY (id, recorded_on_dt);


UPDATE semantics.snapshot_history
SET    recorded_on_dt   = COALESCE(created_at, NOW()),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = COALESCE(created_at, NOW()),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshot_active_id
    ON semantics.snapshot_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.snapshot AS
SELECT id, label, version, parent_id, status, created_by, created_at, notes,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.snapshot_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.snapshot_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.snapshot_history
        (id, label, version, parent_id, status, created_by, created_at, notes,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.label, NEW.version, NEW.parent_id, NEW.status, NEW.created_by, COALESCE(NEW.created_at, NOW()), NEW.notes,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_insert
    INSTEAD OF INSERT ON semantics.snapshot
    FOR EACH ROW EXECUTE FUNCTION semantics.snapshot_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.snapshot_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.snapshot_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.snapshot_history
        (id, label, version, parent_id, status, created_by, created_at, notes,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.label, NEW.version, NEW.parent_id, NEW.status, NEW.created_by, OLD.created_at, NEW.notes,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, label, version, parent_id, status, created_by, created_at, notes,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_update
    INSTEAD OF UPDATE ON semantics.snapshot
    FOR EACH ROW EXECUTE FUNCTION semantics.snapshot_update_trigger();

CREATE OR REPLACE FUNCTION semantics.snapshot_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.snapshot_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_delete
    INSTEAD OF DELETE ON semantics.snapshot
    FOR EACH ROW EXECUTE FUNCTION semantics.snapshot_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_snapshot(
    p_id uuid DEFAULT NULL,
    p_label text DEFAULT NULL,
    p_version integer DEFAULT NULL,
    p_parent_id uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_created_by text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.snapshot AS $$
DECLARE
    v_row semantics.snapshot%ROWTYPE;
BEGIN
    INSERT INTO semantics.snapshot (id, label, version, parent_id, status, created_by, notes, valid_from, valid_until)
    VALUES (p_id, p_label, p_version, p_parent_id, p_status, p_created_by, p_notes, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_snapshot(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.snapshot_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  snapshot_observation
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.snapshot_observation RENAME TO snapshot_observation_history;

ALTER TABLE semantics.snapshot_observation_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.snapshot_observation_history DROP CONSTRAINT snapshot_observation_pkey;
ALTER TABLE semantics.snapshot_observation_history ADD PRIMARY KEY (id, recorded_on_dt);

ALTER TABLE semantics.snapshot_observation_history DROP CONSTRAINT IF EXISTS snapshot_observation_snapshot_id_representation_id_key;

UPDATE semantics.snapshot_observation_history
SET    recorded_on_dt   = NOW(),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = NOW(),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshot_observation_active_id
    ON semantics.snapshot_observation_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshot_observation_active_snapshot_id_representation_id
    ON semantics.snapshot_observation_history (snapshot_id, representation_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.snapshot_observation AS
SELECT id, snapshot_id, representation_id, lifecycle_state, is_completed_fix, completed_fix_ref, audit_reason, safe_to_retire,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.snapshot_observation_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.snapshot_observation_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.snapshot_observation_history
        (id, snapshot_id, representation_id, lifecycle_state, is_completed_fix, completed_fix_ref, audit_reason, safe_to_retire,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.snapshot_id, NEW.representation_id, NEW.lifecycle_state, NEW.is_completed_fix, NEW.completed_fix_ref, NEW.audit_reason, NEW.safe_to_retire,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_observation_insert
    INSTEAD OF INSERT ON semantics.snapshot_observation
    FOR EACH ROW EXECUTE FUNCTION semantics.snapshot_observation_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.snapshot_observation_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.snapshot_observation_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.snapshot_observation_history
        (id, snapshot_id, representation_id, lifecycle_state, is_completed_fix, completed_fix_ref, audit_reason, safe_to_retire,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.snapshot_id, NEW.representation_id, NEW.lifecycle_state, NEW.is_completed_fix, NEW.completed_fix_ref, NEW.audit_reason, NEW.safe_to_retire,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, snapshot_id, representation_id, lifecycle_state, is_completed_fix, completed_fix_ref, audit_reason, safe_to_retire,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_observation_update
    INSTEAD OF UPDATE ON semantics.snapshot_observation
    FOR EACH ROW EXECUTE FUNCTION semantics.snapshot_observation_update_trigger();

CREATE OR REPLACE FUNCTION semantics.snapshot_observation_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.snapshot_observation_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_observation_delete
    INSTEAD OF DELETE ON semantics.snapshot_observation
    FOR EACH ROW EXECUTE FUNCTION semantics.snapshot_observation_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_snapshot_observation(
    p_id uuid DEFAULT NULL,
    p_snapshot_id uuid DEFAULT NULL,
    p_representation_id uuid DEFAULT NULL,
    p_lifecycle_state text DEFAULT NULL,
    p_is_completed_fix boolean DEFAULT NULL,
    p_completed_fix_ref text DEFAULT NULL,
    p_audit_reason text DEFAULT NULL,
    p_safe_to_retire boolean DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.snapshot_observation AS $$
DECLARE
    v_row semantics.snapshot_observation%ROWTYPE;
BEGIN
    INSERT INTO semantics.snapshot_observation (id, snapshot_id, representation_id, lifecycle_state, is_completed_fix, completed_fix_ref, audit_reason, safe_to_retire, valid_from, valid_until)
    VALUES (p_id, p_snapshot_id, p_representation_id, p_lifecycle_state, p_is_completed_fix, p_completed_fix_ref, p_audit_reason, p_safe_to_retire, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_snapshot_observation(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.snapshot_observation_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  drift_finding
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.drift_finding RENAME TO drift_finding_history;

ALTER TABLE semantics.drift_finding_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.drift_finding_history DROP CONSTRAINT drift_finding_pkey;
ALTER TABLE semantics.drift_finding_history ADD PRIMARY KEY (id, recorded_on_dt);


UPDATE semantics.drift_finding_history
SET    recorded_on_dt   = NOW(),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = NOW(),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_drift_finding_active_id
    ON semantics.drift_finding_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.drift_finding AS
SELECT id, observation_id, description, severity, detected_at, resolved_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.drift_finding_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.drift_finding_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.drift_finding_history
        (id, observation_id, description, severity, detected_at, resolved_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.observation_id, NEW.description, NEW.severity, NEW.detected_at, NEW.resolved_at,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_drift_finding_insert
    INSTEAD OF INSERT ON semantics.drift_finding
    FOR EACH ROW EXECUTE FUNCTION semantics.drift_finding_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.drift_finding_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.drift_finding_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.drift_finding_history
        (id, observation_id, description, severity, detected_at, resolved_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.observation_id, NEW.description, NEW.severity, NEW.detected_at, NEW.resolved_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, observation_id, description, severity, detected_at, resolved_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_drift_finding_update
    INSTEAD OF UPDATE ON semantics.drift_finding
    FOR EACH ROW EXECUTE FUNCTION semantics.drift_finding_update_trigger();

CREATE OR REPLACE FUNCTION semantics.drift_finding_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.drift_finding_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_drift_finding_delete
    INSTEAD OF DELETE ON semantics.drift_finding
    FOR EACH ROW EXECUTE FUNCTION semantics.drift_finding_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_drift_finding(
    p_id uuid DEFAULT NULL,
    p_observation_id uuid DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_severity text DEFAULT NULL,
    p_detected_at timestamptz DEFAULT NULL,
    p_resolved_at timestamptz DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.drift_finding AS $$
DECLARE
    v_row semantics.drift_finding%ROWTYPE;
BEGIN
    INSERT INTO semantics.drift_finding (id, observation_id, description, severity, detected_at, resolved_at, valid_from, valid_until)
    VALUES (p_id, p_observation_id, p_description, p_severity, p_detected_at, p_resolved_at, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_drift_finding(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.drift_finding_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  concept_relationship
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.concept_relationship RENAME TO concept_relationship_history;

ALTER TABLE semantics.concept_relationship_history
    ADD COLUMN recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    ADD COLUMN valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00';

ALTER TABLE semantics.concept_relationship_history DROP CONSTRAINT concept_relationship_pkey;
ALTER TABLE semantics.concept_relationship_history ADD PRIMARY KEY (id, recorded_on_dt);


UPDATE semantics.concept_relationship_history
SET    recorded_on_dt   = NOW(),
       recorded_until_dt = '9999-12-31 23:59:59+00',
       valid_from       = NOW(),
       valid_until      = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_relationship_active_id
    ON semantics.concept_relationship_history (id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE OR REPLACE VIEW semantics.concept_relationship AS
SELECT id, from_concept_id, to_concept_id, relationship_type, path, notes, effective_at, expired_at,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   semantics.concept_relationship_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

CREATE OR REPLACE FUNCTION semantics.concept_relationship_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());
    INSERT INTO semantics.concept_relationship_history
        (id, from_concept_id, to_concept_id, relationship_type, path, notes, effective_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.from_concept_id, NEW.to_concept_id, NEW.relationship_type, NEW.path, NEW.notes, NEW.effective_at, NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));
    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_concept_relationship_insert
    INSTEAD OF INSERT ON semantics.concept_relationship
    FOR EACH ROW EXECUTE FUNCTION semantics.concept_relationship_insert_trigger();

CREATE OR REPLACE FUNCTION semantics.concept_relationship_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE semantics.concept_relationship_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO semantics.concept_relationship_history
        (id, from_concept_id, to_concept_id, relationship_type, path, notes, effective_at, expired_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.from_concept_id, NEW.to_concept_id, NEW.relationship_type, NEW.path, NEW.notes, NEW.effective_at, NEW.expired_at,
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, from_concept_id, to_concept_id, relationship_type, path, notes, effective_at, expired_at,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_concept_relationship_update
    INSTEAD OF UPDATE ON semantics.concept_relationship
    FOR EACH ROW EXECUTE FUNCTION semantics.concept_relationship_update_trigger();

CREATE OR REPLACE FUNCTION semantics.concept_relationship_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.concept_relationship_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_concept_relationship_delete
    INSTEAD OF DELETE ON semantics.concept_relationship
    FOR EACH ROW EXECUTE FUNCTION semantics.concept_relationship_delete_trigger();

CREATE OR REPLACE FUNCTION semantics.add_concept_relationship(
    p_id uuid DEFAULT NULL,
    p_from_concept_id uuid DEFAULT NULL,
    p_to_concept_id uuid DEFAULT NULL,
    p_relationship_type text DEFAULT NULL,
    p_path text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_effective_at timestamptz DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL
) RETURNS semantics.concept_relationship AS $$
DECLARE
    v_row semantics.concept_relationship%ROWTYPE;
BEGIN
    INSERT INTO semantics.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, effective_at, expired_at, valid_from, valid_until)
    VALUES (p_id, p_from_concept_id, p_to_concept_id, p_relationship_type, p_path, p_notes, p_effective_at, p_expired_at, p_valid_from, p_valid_until)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_concept_relationship(p_id uuid)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.concept_relationship_history
    SET    recorded_until_dt = NOW()
    WHERE  id = p_id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$ DECLARE
    v_count integer;
    v_tables text;
BEGIN
    SELECT string_agg(table_name, ', ' ORDER BY table_name)
      INTO v_tables
      FROM information_schema.tables
     WHERE table_schema = 'semantics' AND table_type = 'VIEW';
    RAISE NOTICE 'semantics views: %', v_tables;
    SELECT COUNT(*) INTO v_count FROM semantics.concept;
    RAISE NOTICE 'Active concepts (view): %', v_count;
    RAISE NOTICE '✅ V055 semantics bitemporal migration complete.';
END $$;

COMMIT;

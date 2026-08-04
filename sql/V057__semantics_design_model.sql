-- ═══════════════════════════════════════════════════════════════════════
--  V057 — semantics: restore design-faithful model
--
--  Reverts the SCD4 bitemporal overlay applied by V055/V056 and rebuilds
--  the schema to the design in semantics-db.md:
--
--    • plain tables (original names), all 14 FK constraints restored,
--      UNIQUE + CHECK constraints per the design DDL
--    • expire-not-delete via the domain's own `expired_at` marker
--      (added to the 6 tables the DDL sketch omitted it on, per the
--      doc's stated doctrine: durable structure is "append-only,
--      expire not delete")
--    • no live views, no INSTEAD OF triggers, no temporal columns    --    • stored procedures re-expressed against this model:
    --        add_<table>(...)          = plain INSERT ... RETURNING *
    --        soft_delete_<table>(id)   = SET expired_at = NOW()
    --        update_<table>(id, ...)   = append-only replace: expire the
    --                                    active row, insert a fresh version
    --                                    (natural-key uniqueness is enforced
    --                                    only among ACTIVE rows via partial
    --                                    unique indexes)
    --
    --  Safe to run only while the schema is empty (V055/V056 were applied
--  to empty tables and no data was loaded). The migration refuses to
--  proceed if any row exists.
--
--  Usage:  psql -h localhost -U pguser -d nexus -f V057__semantics_design_model.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  0. SAFETY — refuse to run if any semantics table contains rows
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    r       RECORD;
    v_count integer;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'semantics'
    LOOP
        EXECUTE format('SELECT count(*) FROM semantics.%I', r.tablename) INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'V057 aborted: semantics.% has % row(s); expected empty (no data migration planned)', r.tablename, v_count;
        END IF;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  1. DROP the SCD4 overlay (views, triggers, procs, history tables)
-- ═══════════════════════════════════════════════════════════════════════
DROP SCHEMA IF EXISTS semantics CASCADE;
CREATE SCHEMA semantics;

-- ═══════════════════════════════════════════════════════════════════════
--  2. DESIGN-FAITHFUL TABLES  (semantics-db.md DDL; + expired_at where
--     the durable-layer doctrine requires an expire marker)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE semantics.owning_subsystem (
    id          smallint PRIMARY KEY,
    name        text NOT NULL,
    description text,
    expired_at  timestamptz
);

CREATE UNIQUE INDEX idx_owning_subsystem_active_name
    ON semantics.owning_subsystem (name) WHERE expired_at IS NULL;

CREATE TABLE semantics.concept (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expired_at  timestamptz
);

CREATE UNIQUE INDEX idx_concept_active_name
    ON semantics.concept (name) WHERE expired_at IS NULL;

CREATE TABLE semantics.representation (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id            uuid NOT NULL REFERENCES semantics.concept(id),
    label                 text NOT NULL,
    schema_name           text,
    table_name            text,
    owning_subsystem_id   smallint NOT NULL REFERENCES semantics.owning_subsystem(id),
    owner                 text,
    raw_metadata          jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    expired_at            timestamptz
);

CREATE TABLE semantics.representation_relationship (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_representation_id  uuid NOT NULL REFERENCES semantics.representation(id),
    to_representation_id    uuid NOT NULL REFERENCES semantics.representation(id),
    relationship_type       text NOT NULL,
    notes                   text,
    effective_at            timestamptz NOT NULL DEFAULT now(),
    expired_at              timestamptz,
    CHECK (from_representation_id <> to_representation_id)
);

CREATE TABLE semantics.consumer_operation (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    representation_id   uuid NOT NULL REFERENCES semantics.representation(id),
    consumer_name       text NOT NULL,
    operation           text NOT NULL,
    notes               text,
    effective_at        timestamptz NOT NULL DEFAULT now(),
    expired_at          timestamptz
);

CREATE TABLE semantics.identity_strategy (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id                  uuid NOT NULL REFERENCES semantics.concept(id),
    canonical_key_description   text NOT NULL,
    notes                       text,
    expired_at                  timestamptz
);

CREATE UNIQUE INDEX idx_identity_strategy_active_concept
    ON semantics.identity_strategy (concept_id) WHERE expired_at IS NULL;

CREATE TABLE semantics.representation_identity (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    representation_id       uuid NOT NULL REFERENCES semantics.representation(id),
    identity_strategy_id    uuid NOT NULL REFERENCES semantics.identity_strategy(id),
    identity_expression     text NOT NULL,
    notes                   text,
    expired_at              timestamptz
);

CREATE UNIQUE INDEX idx_representation_identity_active_representation
    ON semantics.representation_identity (representation_id) WHERE expired_at IS NULL;

CREATE TABLE semantics.snapshot (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label       text NOT NULL,
    version     integer NOT NULL,
    parent_id   uuid REFERENCES semantics.snapshot(id),
    status      text NOT NULL DEFAULT 'draft',
    created_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    notes       text,
    expired_at  timestamptz
);

CREATE TABLE semantics.snapshot_observation (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id         uuid NOT NULL REFERENCES semantics.snapshot(id),
    representation_id   uuid NOT NULL REFERENCES semantics.representation(id),
    lifecycle_state     text NOT NULL,
    is_completed_fix    boolean NOT NULL DEFAULT false,
    completed_fix_ref   text,
    audit_reason        text,
    safe_to_retire      boolean,
    expired_at          timestamptz
);

CREATE UNIQUE INDEX idx_snapshot_observation_active_pair
    ON semantics.snapshot_observation (snapshot_id, representation_id) WHERE expired_at IS NULL;

CREATE TABLE semantics.drift_finding (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id  uuid NOT NULL REFERENCES semantics.snapshot_observation(id),
    description     text NOT NULL,
    severity        text NOT NULL,
    detected_at     timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz,
    expired_at      timestamptz
);

CREATE TABLE semantics.concept_relationship (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_concept_id     uuid NOT NULL REFERENCES semantics.concept(id),
    to_concept_id       uuid NOT NULL REFERENCES semantics.concept(id),
    relationship_type   text NOT NULL,
    path                text,
    notes               text,
    effective_at        timestamptz NOT NULL DEFAULT now(),
    expired_at          timestamptz
);

-- ═══════════════════════════════════════════════════════════════════════
--  3. STORED PROCEDURES — design model
--     add_<table>       plain INSERT ... RETURNING *
--     soft_delete_<table> SET expired_at = NOW() WHERE not already expired
-- ═══════════════════════════════════════════════════════════════════════

-- owning_subsystem (id is required — smallint lookup key)
CREATE OR REPLACE FUNCTION semantics.add_owning_subsystem(
    p_id smallint DEFAULT NULL, p_name text DEFAULT NULL,
    p_description text DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.owning_subsystem AS $$
DECLARE v_row semantics.owning_subsystem%ROWTYPE;
BEGIN
    INSERT INTO semantics.owning_subsystem (id, name, description, expired_at)
    VALUES (p_id, p_name, p_description, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_owning_subsystem(p_id smallint)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.owning_subsystem SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- concept
CREATE OR REPLACE FUNCTION semantics.add_concept(
    p_id uuid DEFAULT NULL, p_name text DEFAULT NULL,
    p_description text DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.concept AS $$
DECLARE v_row semantics.concept%ROWTYPE;
BEGIN
    INSERT INTO semantics.concept (id, name, description, expired_at)
    VALUES (COALESCE(p_id, gen_random_uuid()), p_name, p_description, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_concept(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.concept SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- representation
CREATE OR REPLACE FUNCTION semantics.add_representation(
    p_id uuid DEFAULT NULL, p_concept_id uuid DEFAULT NULL, p_label text DEFAULT NULL,
    p_schema_name text DEFAULT NULL, p_table_name text DEFAULT NULL,
    p_owning_subsystem_id smallint DEFAULT NULL, p_owner text DEFAULT NULL,
    p_raw_metadata jsonb DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.representation AS $$
DECLARE v_row semantics.representation%ROWTYPE;
BEGIN
    INSERT INTO semantics.representation
        (id, concept_id, label, schema_name, table_name, owning_subsystem_id,
         owner, raw_metadata, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_concept_id, p_label, p_schema_name, p_table_name,
         p_owning_subsystem_id, p_owner, p_raw_metadata, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_representation(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.representation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- representation_relationship
CREATE OR REPLACE FUNCTION semantics.add_representation_relationship(
    p_id uuid DEFAULT NULL, p_from_representation_id uuid DEFAULT NULL,
    p_to_representation_id uuid DEFAULT NULL, p_relationship_type text DEFAULT NULL,
    p_notes text DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.representation_relationship AS $$
DECLARE v_row semantics.representation_relationship%ROWTYPE;
BEGIN
    INSERT INTO semantics.representation_relationship
        (id, from_representation_id, to_representation_id, relationship_type, notes, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_from_representation_id, p_to_representation_id, p_relationship_type, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_representation_relationship(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.representation_relationship SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- consumer_operation
CREATE OR REPLACE FUNCTION semantics.add_consumer_operation(
    p_id uuid DEFAULT NULL, p_representation_id uuid DEFAULT NULL,
    p_consumer_name text DEFAULT NULL, p_operation text DEFAULT NULL,
    p_notes text DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.consumer_operation AS $$
DECLARE v_row semantics.consumer_operation%ROWTYPE;
BEGIN
    INSERT INTO semantics.consumer_operation
        (id, representation_id, consumer_name, operation, notes, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_representation_id, p_consumer_name, p_operation, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_consumer_operation(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.consumer_operation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- identity_strategy
CREATE OR REPLACE FUNCTION semantics.add_identity_strategy(
    p_id uuid DEFAULT NULL, p_concept_id uuid DEFAULT NULL,
    p_canonical_key_description text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.identity_strategy AS $$
DECLARE v_row semantics.identity_strategy%ROWTYPE;
BEGIN
    INSERT INTO semantics.identity_strategy
        (id, concept_id, canonical_key_description, notes, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_concept_id, p_canonical_key_description, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_identity_strategy(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.identity_strategy SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- representation_identity
CREATE OR REPLACE FUNCTION semantics.add_representation_identity(
    p_id uuid DEFAULT NULL, p_representation_id uuid DEFAULT NULL,
    p_identity_strategy_id uuid DEFAULT NULL, p_identity_expression text DEFAULT NULL,
    p_notes text DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.representation_identity AS $$
DECLARE v_row semantics.representation_identity%ROWTYPE;
BEGIN
    INSERT INTO semantics.representation_identity
        (id, representation_id, identity_strategy_id, identity_expression, notes, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_representation_id, p_identity_strategy_id, p_identity_expression, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_representation_identity(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.representation_identity SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- snapshot
CREATE OR REPLACE FUNCTION semantics.add_snapshot(
    p_id uuid DEFAULT NULL, p_label text DEFAULT NULL, p_version integer DEFAULT NULL,
    p_parent_id uuid DEFAULT NULL, p_status text DEFAULT 'draft',
    p_created_by text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.snapshot AS $$
DECLARE v_row semantics.snapshot%ROWTYPE;
BEGIN
    INSERT INTO semantics.snapshot
        (id, label, version, parent_id, status, created_by, notes, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_label, p_version, p_parent_id, p_status, p_created_by, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_snapshot(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.snapshot SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- snapshot_observation
CREATE OR REPLACE FUNCTION semantics.add_snapshot_observation(
    p_id uuid DEFAULT NULL, p_snapshot_id uuid DEFAULT NULL,
    p_representation_id uuid DEFAULT NULL, p_lifecycle_state text DEFAULT NULL,
    p_is_completed_fix boolean DEFAULT false, p_completed_fix_ref text DEFAULT NULL,
    p_audit_reason text DEFAULT NULL, p_safe_to_retire boolean DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.snapshot_observation AS $$
DECLARE v_row semantics.snapshot_observation%ROWTYPE;
BEGIN
    INSERT INTO semantics.snapshot_observation
        (id, snapshot_id, representation_id, lifecycle_state, is_completed_fix,
         completed_fix_ref, audit_reason, safe_to_retire, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_snapshot_id, p_representation_id, p_lifecycle_state,
         p_is_completed_fix, p_completed_fix_ref, p_audit_reason, p_safe_to_retire, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_snapshot_observation(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.snapshot_observation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- drift_finding
CREATE OR REPLACE FUNCTION semantics.add_drift_finding(
    p_id uuid DEFAULT NULL, p_observation_id uuid DEFAULT NULL,
    p_description text DEFAULT NULL, p_severity text DEFAULT NULL,
    p_resolved_at timestamptz DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.drift_finding AS $$
DECLARE v_row semantics.drift_finding%ROWTYPE;
BEGIN
    INSERT INTO semantics.drift_finding
        (id, observation_id, description, severity, resolved_at, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_observation_id, p_description, p_severity, p_resolved_at, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_drift_finding(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.drift_finding SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- concept_relationship
CREATE OR REPLACE FUNCTION semantics.add_concept_relationship(
    p_id uuid DEFAULT NULL, p_from_concept_id uuid DEFAULT NULL,
    p_to_concept_id uuid DEFAULT NULL, p_relationship_type text DEFAULT NULL,
    p_path text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.concept_relationship AS $$
DECLARE v_row semantics.concept_relationship%ROWTYPE;
BEGIN
    INSERT INTO semantics.concept_relationship
        (id, from_concept_id, to_concept_id, relationship_type, path, notes, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_from_concept_id, p_to_concept_id, p_relationship_type, p_path, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_concept_relationship(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.concept_relationship SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  4. UPDATE PROCS — append-only replace
--     expire the active row identified by p_id, then insert a fresh
--     version atomically (new uuid id). Natural-key uniqueness is
--     enforced only among ACTIVE rows (partial unique indexes above).
--     Raises if no active row exists for p_id.
-- ═══════════════════════════════════════════════════════════════════════

-- owning_subsystem (smallint key: caller supplies the new id)
CREATE OR REPLACE FUNCTION semantics.update_owning_subsystem(
    p_id smallint, p_new_id smallint, p_name text DEFAULT NULL,
    p_description text DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.owning_subsystem AS $$
DECLARE v_row semantics.owning_subsystem%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.owning_subsystem SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_owning_subsystem: no active row with id %', p_id; END IF;
    INSERT INTO semantics.owning_subsystem (id, name, description, expired_at)
    VALUES (p_new_id, p_name, p_description, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_concept(
    p_id uuid, p_name text DEFAULT NULL, p_description text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.concept AS $$
DECLARE v_row semantics.concept%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.concept SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_concept: no active row with id %', p_id; END IF;
    INSERT INTO semantics.concept (id, name, description, expired_at)
    VALUES (gen_random_uuid(), p_name, p_description, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_representation(
    p_id uuid, p_concept_id uuid DEFAULT NULL, p_label text DEFAULT NULL,
    p_schema_name text DEFAULT NULL, p_table_name text DEFAULT NULL,
    p_owning_subsystem_id smallint DEFAULT NULL, p_owner text DEFAULT NULL,
    p_raw_metadata jsonb DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.representation AS $$
DECLARE v_row semantics.representation%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.representation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_representation: no active row with id %', p_id; END IF;
    INSERT INTO semantics.representation
        (id, concept_id, label, schema_name, table_name, owning_subsystem_id,
         owner, raw_metadata, expired_at)
    VALUES
        (gen_random_uuid(), p_concept_id, p_label, p_schema_name, p_table_name,
         p_owning_subsystem_id, p_owner, p_raw_metadata, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_representation_relationship(
    p_id uuid, p_from_representation_id uuid DEFAULT NULL,
    p_to_representation_id uuid DEFAULT NULL, p_relationship_type text DEFAULT NULL,
    p_notes text DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.representation_relationship AS $$
DECLARE v_row semantics.representation_relationship%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.representation_relationship SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_representation_relationship: no active row with id %', p_id; END IF;
    INSERT INTO semantics.representation_relationship
        (id, from_representation_id, to_representation_id, relationship_type, notes, expired_at)
    VALUES
        (gen_random_uuid(), p_from_representation_id, p_to_representation_id,
         p_relationship_type, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_consumer_operation(
    p_id uuid, p_representation_id uuid DEFAULT NULL, p_consumer_name text DEFAULT NULL,
    p_operation text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.consumer_operation AS $$
DECLARE v_row semantics.consumer_operation%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.consumer_operation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_consumer_operation: no active row with id %', p_id; END IF;
    INSERT INTO semantics.consumer_operation
        (id, representation_id, consumer_name, operation, notes, expired_at)
    VALUES
        (gen_random_uuid(), p_representation_id, p_consumer_name, p_operation, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_identity_strategy(
    p_id uuid, p_concept_id uuid DEFAULT NULL,
    p_canonical_key_description text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.identity_strategy AS $$
DECLARE v_row semantics.identity_strategy%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.identity_strategy SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_identity_strategy: no active row with id %', p_id; END IF;
    INSERT INTO semantics.identity_strategy
        (id, concept_id, canonical_key_description, notes, expired_at)
    VALUES
        (gen_random_uuid(), p_concept_id, p_canonical_key_description, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_representation_identity(
    p_id uuid, p_representation_id uuid DEFAULT NULL, p_identity_strategy_id uuid DEFAULT NULL,
    p_identity_expression text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.representation_identity AS $$
DECLARE v_row semantics.representation_identity%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.representation_identity SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_representation_identity: no active row with id %', p_id; END IF;
    INSERT INTO semantics.representation_identity
        (id, representation_id, identity_strategy_id, identity_expression, notes, expired_at)
    VALUES
        (gen_random_uuid(), p_representation_id, p_identity_strategy_id,
         p_identity_expression, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_snapshot(
    p_id uuid, p_label text DEFAULT NULL, p_version integer DEFAULT NULL,
    p_parent_id uuid DEFAULT NULL, p_status text DEFAULT 'draft',
    p_created_by text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.snapshot AS $$
DECLARE v_row semantics.snapshot%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.snapshot SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_snapshot: no active row with id %', p_id; END IF;
    INSERT INTO semantics.snapshot
        (id, label, version, parent_id, status, created_by, notes, expired_at)
    VALUES
        (gen_random_uuid(), p_label, p_version, p_parent_id, p_status, p_created_by, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_snapshot_observation(
    p_id uuid, p_snapshot_id uuid DEFAULT NULL, p_representation_id uuid DEFAULT NULL,
    p_lifecycle_state text DEFAULT NULL, p_is_completed_fix boolean DEFAULT false,
    p_completed_fix_ref text DEFAULT NULL, p_audit_reason text DEFAULT NULL,
    p_safe_to_retire boolean DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.snapshot_observation AS $$
DECLARE v_row semantics.snapshot_observation%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.snapshot_observation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_snapshot_observation: no active row with id %', p_id; END IF;
    INSERT INTO semantics.snapshot_observation
        (id, snapshot_id, representation_id, lifecycle_state, is_completed_fix,
         completed_fix_ref, audit_reason, safe_to_retire, expired_at)
    VALUES
        (gen_random_uuid(), p_snapshot_id, p_representation_id, p_lifecycle_state,
         p_is_completed_fix, p_completed_fix_ref, p_audit_reason, p_safe_to_retire, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_drift_finding(
    p_id uuid, p_observation_id uuid DEFAULT NULL, p_description text DEFAULT NULL,
    p_severity text DEFAULT NULL, p_resolved_at timestamptz DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.drift_finding AS $$
DECLARE v_row semantics.drift_finding%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.drift_finding SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_drift_finding: no active row with id %', p_id; END IF;
    INSERT INTO semantics.drift_finding
        (id, observation_id, description, severity, resolved_at, expired_at)
    VALUES
        (gen_random_uuid(), p_observation_id, p_description, p_severity, p_resolved_at, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_concept_relationship(
    p_id uuid, p_from_concept_id uuid DEFAULT NULL, p_to_concept_id uuid DEFAULT NULL,
    p_relationship_type text DEFAULT NULL, p_path text DEFAULT NULL,
    p_notes text DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.concept_relationship AS $$
DECLARE v_row semantics.concept_relationship%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.concept_relationship SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_concept_relationship: no active row with id %', p_id; END IF;
    INSERT INTO semantics.concept_relationship
        (id, from_concept_id, to_concept_id, relationship_type, path, notes, expired_at)
    VALUES
        (gen_random_uuid(), p_from_concept_id, p_to_concept_id,
         p_relationship_type, p_path, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  5. VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_tables integer;
    v_fks    integer;
    v_procs  integer;
    v_views  integer;
    v_temporal integer;
    v_active_idx integer;
BEGIN
    SELECT count(*) INTO v_tables FROM pg_tables WHERE schemaname = 'semantics';
    SELECT count(*) INTO v_fks
      FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace
     WHERE con.contype = 'f' AND nsp.nspname = 'semantics';
    SELECT count(*) INTO v_procs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'semantics'
       AND (p.proname LIKE 'add_%' OR p.proname LIKE 'soft_delete_%' OR p.proname LIKE 'update_%');
    SELECT count(*) INTO v_views FROM information_schema.views WHERE table_schema = 'semantics';
    SELECT count(*) INTO v_temporal
      FROM information_schema.columns
     WHERE table_schema = 'semantics'
       AND column_name IN ('recorded_on_dt','recorded_until_dt','valid_from','valid_until');
    SELECT count(*) INTO v_active_idx
      FROM pg_indexes
     WHERE schemaname = 'semantics' AND indexname LIKE 'idx_%_active_%';

    RAISE NOTICE 'tables=%, fks=%, procs=%, views=%, temporal_columns=%, active_unique_indexes=%',
                 v_tables, v_fks, v_procs, v_views, v_temporal, v_active_idx;
    RAISE NOTICE '✅ V057 applied — semantics is back to the design-faithful model.';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
--  V056 — representation_identity: system-time only (drop valid time)
--
--  representation_identity is a lookup table; it does not need to be
--  truly bitemporal. This migration removes the valid-time dimension
--  (valid_from / valid_until) while KEEPING system-time versioning
--  (recorded_on_dt / recorded_until_dt), which powers soft-delete and
--  history.
--
--  Corrects the treatment applied by V055 (which made all 11 semantics
--  tables fully bitemporal).
--
--  Usage:  psql -h localhost -U pguser -d nexus -f V056__representation_identity_system_time_only.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop the view (also drops its INSTEAD OF trigger objects)
DROP VIEW IF EXISTS semantics.representation_identity CASCADE;

-- 2. Drop the valid-time columns from the history table
ALTER TABLE semantics.representation_identity_history
    DROP COLUMN valid_from,
    DROP COLUMN valid_until;

-- 3. Recreate trigger functions (system-time only)
CREATE OR REPLACE FUNCTION semantics.representation_identity_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO semantics.representation_identity_history
        (id, representation_id, identity_strategy_id, identity_expression, notes,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.representation_id, NEW.identity_strategy_id, NEW.identity_expression, NEW.notes,
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.representation_id, NEW.identity_strategy_id, NEW.identity_expression, NEW.notes,
         NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, representation_id, identity_strategy_id, identity_expression, notes,
              recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.representation_identity_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE semantics.representation_identity_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 4. Recreate the view (system-time only, no valid columns)
CREATE OR REPLACE VIEW semantics.representation_identity AS
SELECT id, representation_id, identity_strategy_id, identity_expression, notes,
       recorded_on_dt, recorded_until_dt
FROM   semantics.representation_identity_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt;

-- 5. Reattach INSTEAD OF triggers
CREATE TRIGGER trg_representation_identity_insert
    INSTEAD OF INSERT ON semantics.representation_identity
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_identity_insert_trigger();
CREATE TRIGGER trg_representation_identity_update
    INSTEAD OF UPDATE ON semantics.representation_identity
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_identity_update_trigger();
CREATE TRIGGER trg_representation_identity_delete
    INSTEAD OF DELETE ON semantics.representation_identity
    FOR EACH ROW EXECUTE FUNCTION semantics.representation_identity_delete_trigger();

-- 6. Replace add proc (drop old valid-time signature, create new)
DROP FUNCTION IF EXISTS semantics.add_representation_identity(uuid, uuid, uuid, text, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION semantics.add_representation_identity(
    p_id uuid DEFAULT NULL,
    p_representation_id uuid DEFAULT NULL,
    p_identity_strategy_id uuid DEFAULT NULL,
    p_identity_expression text DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS semantics.representation_identity AS $$
DECLARE
    v_row semantics.representation_identity%ROWTYPE;
BEGIN
    INSERT INTO semantics.representation_identity (id, representation_id, identity_strategy_id, identity_expression, notes)
    VALUES (p_id, p_representation_id, p_identity_strategy_id, p_identity_expression, p_notes)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- soft_delete proc signature is unchanged; body still system-time expire only
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
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$ DECLARE
    v_cols text;
    v_count integer;
BEGIN
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
      INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'semantics' AND table_name = 'representation_identity_history';
    RAISE NOTICE 'representation_identity_history columns: %', v_cols;

    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
      INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'semantics' AND table_name = 'representation_identity';
    RAISE NOTICE 'representation_identity (view) columns: %', v_cols;

    SELECT COUNT(*) INTO v_count
      FROM information_schema.columns
     WHERE table_schema = 'semantics' AND table_name = 'representation_identity'
       AND column_name IN ('valid_from', 'valid_until');
    RAISE NOTICE 'valid-time columns remaining: %', v_count;

    SELECT COUNT(*) INTO v_count
      FROM information_schema.routines
     WHERE routine_schema = 'semantics'
       AND routine_name IN ('add_representation_identity', 'soft_delete_representation_identity');
    RAISE NOTICE 'procs present: %', v_count;

    RAISE NOTICE '✅ V056 applied — representation_identity is system-time only.';
END $$;

COMMIT;

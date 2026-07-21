-- ============================================================================
-- shrapnel migration 0002: enforce value <-> value_<type> one-to-one and
--                                  type-match at the database level
-- ----------------------------------------------------------------------------
-- Background
--   The original review called out that the value/value_type pair was a
--   polymorphic association implemented as a string convention. The shrapnel
--   schema encodes the polymorphism by row presence in one of seven
--   value_<type> extension tables. Each extension's PK (id) is FK -> value.id
--   so a single value id can never appear twice in the SAME extension table,
--   and CASCADE on delete keeps things tidy. But two real gaps remained at
--   construction time:
--
--     G1  (existence)  a value row may have NO matching extension row
--     G2  (type-match) an extension row inserted for the WRONG type code
--                       is silently accepted because the FK only links
--                       id -> value.id, not id -> value(id, value_type_code)
--
--   G1 cannot be solved by pure SQL constraints for free (the parent doesn't
--   know which extension to expect). The write path (lib/encode.js) already
--   inserts both rows in a single transaction, so existence is structurally
--   guaranteed at the application layer for this service.
--
--   G2 IS closeable at the DB level with cheap BEFORE INSERT/UPDATE
--   triggers on each extension table, which ASSERT that the parent value
--   row's value_type_code matches the type the extension represents.
--   A positive side-effect: this also acts as a cross-extension uniqueness
--   net (since two extension rows for the same value_id would require two
--   different extension tables, each of which now type-checks against the
--   same parent value_type_code -- the second one's type guard fails).
--
-- This migration:
--   1. Adds the type-guard trigger function ONCE (parameterised by code).
--   2. Installs a BEFORE INSERT OR UPDATE trigger on every value_<type>
--      table that asserts the type code matches.
--   3. Documents in comments where the residual existence gap lives and
--      how it is closed by the API write path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Trigger function: assert that NEW.id's parent value row has the expected
-- value_type_code. The expected code is the TG_ARGV[0] passed by the trigger.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shrapnel.assert_extension_type_matches()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_code smallint := TG_ARGV[0]::smallint;
    actual_code   smallint;
BEGIN
    IF TG_WHEN <> 'BEFORE' THEN
        RAISE EXCEPTION 'shrapnel.assert_extension_type_matches must be a BEFORE trigger (got %)', TG_WHEN;
    END IF;

    SELECT value_type_code INTO actual_code
    FROM shrapnel.value
    WHERE id = NEW.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'shrapnel.%: insert into extension for value_id=% but no parent row exists in shrapnel.value',
            TG_TABLE_NAME, NEW.id;
    END IF;

    IF actual_code <> expected_code THEN
        RAISE EXCEPTION
            'shrapnel.%: type-match violation for value_id=%: extension requires value_type_code=% but parent has %',
            TG_TABLE_NAME, NEW.id, expected_code, actual_code;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION shrapnel.assert_extension_type_matches() IS
    'BEFORE INSERT/UPDATE guard that rejects a value_<type> extension row when the parent shrapnel.value row''s value_type_code does not match the type the extension represents.';

-- ----------------------------------------------------------------------------
-- Install the guard on each extension table. Use CREATE OR REPLACE TRIGGER
-- (PG14+) so re-applying is idempotent; fall back to DROP+CREATE for safety.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    pair RECORD;
BEGIN
    FOR pair IN
        SELECT ext AS ext_table, code AS expected_code
        FROM (VALUES
            ('value_long',      1),
            ('value_string',    2),
            ('value_double',    3),
            ('value_boolean',   4),
            ('value_timestamp', 5),
            ('value_jsonb',     6),
            ('value_uuid',      7)
        ) AS v(ext, code)
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON shrapnel.%I;',
            'trg_' || pair.ext_table || '_type_guard',
            pair.ext_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I
                BEFORE INSERT OR UPDATE ON shrapnel.%I
                FOR EACH ROW
                EXECUTE FUNCTION shrapnel.assert_extension_type_matches(%L);',
            'trg_' || pair.ext_table || '_type_guard',
            pair.ext_table,
            pair.expected_code::text
        );
        EXECUTE format(
            'COMMENT ON TRIGGER %I ON shrapnel.%I IS $TXT$Reject extension rows whose parent value.value_type_code is not %s.$TXT$;',
            'trg_' || pair.ext_table || '_type_guard',
            pair.ext_table,
            pair.expected_code
        );
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Documentation: the residual existence gap (G1)
--   A value row may legally have NO row in any value_<type> extension at the
--   schema level. The shrapnel-srv write path (see src/lib/encode.js,
--   `encodePayload`) inserts BOTH the value base row AND the matching
--   value_<type> row inside the SAME transaction -- a partial insert cannot
--   escape the connection-level transaction. Code that writes to shrapnel
--   value tables OUTSIDE the shrapnel-srv API MUST maintain the same
--   invariant (value row + extension row in one transaction).
--
--   The type-match guards (G2) added by this migration ensure that even a
--   non-API writer cannot insert an extension for the wrong type. They also
--   make the cross-extension uniqueness gap detectable: a value id can only
--   ever live in the ONE extension table that matches its declared type.
-- ----------------------------------------------------------------------------

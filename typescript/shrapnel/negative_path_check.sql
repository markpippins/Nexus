-- ============================================================================
-- shrapnel negative-path checks: prove the value_<type> type-match guard fired
-- by migrations/0002_value_extension_type_guard.sql does its job.
-- Run with: psql -f migrations/0003_negative_path_check.sql -v ON_ERROR_STOP=1
-- (intentionally designed so the negative cases raise; uses \if/\endif to
-- report OK / FAIL inside psql).
-- ============================================================================

\set ON_ERROR_STOP off
SET client_min_messages = 'error';

-- Start clean.
TRUNCATE
    shrapnel.object_attribute_value,
    shrapnel.value_long, shrapnel.value_string, shrapnel.value_double,
    shrapnel.value_boolean, shrapnel.value_timestamp, shrapnel.value_jsonb,
    shrapnel.value_uuid,
    shrapnel.value, shrapnel.object_instance, shrapnel.field
    RESTART IDENTITY CASCADE;

-- Fresh value row of type Long (code 1) -- id will be 1 after the truncate.
INSERT INTO shrapnel.value(value_type_code) VALUES (1) RETURNING id AS vid \gset

-- Case A: wrong-extension insert (value_string for a Long-typed value).
\echo '--- Case A: wrong-extension insert (value_string for Long value) ---'
INSERT INTO shrapnel.value_string(id, value) VALUES (:vid, 'this should fail');
\if :ERROR
    \echo '  OK: rejected -- ':ERROR_MESSAGE
\else
    \echo '  FAIL: expected rejection'
\endif

-- Case B: same value_id into TWO different extension tables.
\echo '--- Case B: succeed Long, then reject Boolean (second extension) ---'
INSERT INTO shrapnel.value_long(id, value) VALUES (:vid, 42);
\if :ERROR
    \echo '  FAIL: value_long insert should have succeeded:':ERROR_MESSAGE
\else
    \echo '  OK: value_long insert accepted'
\endif

INSERT INTO shrapnel.value_boolean(id, value) VALUES (:vid, true);
\if :ERROR
    \echo '  OK: second-extension rejected -- ':ERROR_MESSAGE
\else
    \echo '  FAIL: expected rejection for second-extension wrong-type'
\endif

-- Case C: extension row for non-existent parent.
\echo '--- Case C: extension row for non-existent parent id ---'
INSERT INTO shrapnel.value_string(id, value) VALUES (999999999, 'ghost');
\if :ERROR
    \echo '  OK: rejected -- ':ERROR_MESSAGE
\else
    \echo '  FAIL: expected rejection for non-existent parent'
\endif

-- Case D: happy path cleanup.
\echo '--- Case D: happy-path Long round-trip after cleanup ---'
DELETE FROM shrapnel.value_long WHERE id = :vid;
UPDATE shrapnel.value SET value_type_code = 1 WHERE id = :vid;
INSERT INTO shrapnel.value_long(id, value) VALUES (:vid, 100);
\if :ERROR
    \echo '  FAIL: happy path should have succeeded:':ERROR_MESSAGE
\else
    \echo '  OK: happy-path Long insert accepted'
\endif

-- Final state: only value(id=<vid>, type=1) + value_long(<vid>, 100) should exist.
\echo '--- final integrity check ---'
SELECT
    (SELECT count(*) FROM shrapnel.value)            AS value_count,
    (SELECT count(*) FROM shrapnel.value_long)       AS long_count,
    (SELECT count(*) FROM shrapnel.value_string)     AS string_count,
    (SELECT count(*) FROM shrapnel.value_boolean)    AS boolean_count;

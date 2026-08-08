-- ═══════════════════════════════════════════════════════════════════════
--  V062 — semantics: owning_subsystem.path + PEB description
--
--  • adds a `path` column to owning_subsystem — the workspace location(s)
--    of each subsystem (comma-separated; grounded in the repo layout)
--  • re-expresses add_/update_owning_subsystem with a p_path param.
--    NOTE: CREATE OR REPLACE cannot change a signature, so the OLD
--    overloads are dropped first (same stale-overload lesson as V061)
--  • updates the peb entry description → "Persistent Engineering Brain"
--  • backfills path values for 15 of 16 subsystems from repo evidence;
--    bitemporal-api has no source directory yet → left NULL
--
--  Idempotent: ADD COLUMN IF NOT EXISTS, DROP FUNCTION IF EXISTS, plain
--  UPDATEs, CREATE OR REPLACE. Safe to re-apply.
--
--  Usage:  psql -h localhost -U pguser -d nexus -f V062__semantics_owning_subsystem_path.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. COLUMN — workspace path(s) of the subsystem
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE semantics.owning_subsystem
    ADD COLUMN IF NOT EXISTS path text;

-- ═══════════════════════════════════════════════════════════════════════
--  2. PROCS — drop old signatures (no p_path), create p_path versions
-- ═══════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS semantics.add_owning_subsystem(smallint, text, text, timestamptz);
DROP FUNCTION IF EXISTS semantics.update_owning_subsystem(smallint, smallint, text, text, timestamptz);

CREATE OR REPLACE FUNCTION semantics.add_owning_subsystem(
    p_id smallint DEFAULT NULL, p_name text DEFAULT NULL,
    p_description text DEFAULT NULL, p_path text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.owning_subsystem AS $$
DECLARE v_row semantics.owning_subsystem%ROWTYPE;
BEGIN
    INSERT INTO semantics.owning_subsystem (id, name, description, path, expired_at)
    VALUES (p_id, p_name, p_description, p_path, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_owning_subsystem(
    p_id smallint, p_new_id smallint, p_name text DEFAULT NULL,
    p_description text DEFAULT NULL, p_path text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.owning_subsystem AS $$
DECLARE v_row semantics.owning_subsystem%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.owning_subsystem SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_owning_subsystem: no active row with id %', p_id; END IF;
    INSERT INTO semantics.owning_subsystem (id, name, description, path, expired_at)
    VALUES (p_new_id, p_name, p_description, p_path, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  3. DATA — PEB description + path backfill (repo-grounded)
-- ═══════════════════════════════════════════════════════════════════════
UPDATE semantics.owning_subsystem
   SET description = 'Persistent Engineering Brain — peb-srv, peb-mcp, peb-kernel (PEB governance/policy); peb-ui'
 WHERE id = 9 AND expired_at IS NULL;

UPDATE semantics.owning_subsystem SET path = v.path
FROM (VALUES
  ( 1, 'typescript/nebula-srv, typescript/nebula-mcp'),
  ( 2, 'typescript/conduit-mcp, typescript/conduit-srv, python/conduit'),
  ( 3, 'typescript/assembly-srv, typescript/assembly-mcp'),
  ( 4, 'typescript/tackle-mcp, typescript/tackle-srv, typescript/role-memory-srv, python/tackle'),
  ( 5, 'typescript/cascade-srv, python/cascade'),
  ( 6, 'typescript/harness-srv, python/nexus_core/harness'),
  ( 7, 'typescript/wind-srv'),
  ( 8, 'python/rover'),
  ( 9, 'typescript/peb-srv, typescript/peb-mcp, jvm/spring/peb-kernel'),
  (10, 'typescript/knowledge-srv, typescript/knowledge-mcp'),
  (11, 'typescript/vision-mcp, python/vision-srv, python/vision'),
  (12, 'jvm/spring/terrain, typescript/terrain-mcp'),
  (13, 'python/timeclock'),
  (14, 'python/address/tts'),
  (16, 'typescript/semantics-srv, typescript/semantics-mcp')
) AS v(id, path)
WHERE semantics.owning_subsystem.id = v.id
  AND semantics.owning_subsystem.expired_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  4. VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_col_exists integer;
    v_peb_desc text;
    v_pathed integer;
    v_null_path integer;
    v_procs integer;
BEGIN
    SELECT count(*) INTO v_col_exists
      FROM information_schema.columns
     WHERE table_schema = 'semantics' AND table_name = 'owning_subsystem' AND column_name = 'path';
    SELECT description INTO v_peb_desc
      FROM semantics.owning_subsystem WHERE id = 9 AND expired_at IS NULL;
    SELECT count(*) INTO v_pathed FROM semantics.owning_subsystem WHERE path IS NOT NULL AND expired_at IS NULL;
    SELECT count(*) INTO v_null_path FROM semantics.owning_subsystem WHERE path IS NULL AND expired_at IS NULL;
    SELECT count(*) INTO v_procs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'semantics'
       AND (p.proname LIKE 'add_%' OR p.proname LIKE 'soft_delete_%'
            OR p.proname LIKE 'update_%' OR p.proname LIKE 'resolve_%');

    RAISE NOTICE 'path_col=%, peb_desc=%, pathed=%, null_path=%, procs=%',
                 v_col_exists, v_peb_desc, v_pathed, v_null_path, v_procs;

    IF v_col_exists <> 1 THEN RAISE EXCEPTION 'V062 verification failed: path column missing'; END IF;
    IF v_peb_desc NOT LIKE 'Persistent Engineering Brain%' THEN RAISE EXCEPTION 'V062 verification failed: peb description not updated'; END IF;
    IF v_pathed <> 15 THEN RAISE EXCEPTION 'V062 verification failed: expected 15 pathed subsystems, got %', v_pathed; END IF;
    IF v_null_path <> 1 THEN RAISE EXCEPTION 'V062 verification failed: expected 1 NULL path (bitemporal-api), got %', v_null_path; END IF;
    IF v_procs <> 37 THEN RAISE EXCEPTION 'V062 verification failed: expected 37 procs, got %', v_procs; END IF;
    RAISE NOTICE '✅ V062 applied — owning_subsystem.path added (15 backfilled), PEB renamed to Persistent Engineering Brain.';
END $$;

COMMIT;

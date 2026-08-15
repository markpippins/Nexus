-- Migration 043: DBA trigger-residue documentation and forward ledger tracking
-- Approved in Assembly To Do W3 on 2026-08-13.

BEGIN;

CREATE TABLE IF NOT EXISTS nebula.schema_version (
  version     INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prokind = 'f'
       AND p.prorettype = 'pg_catalog.trigger'::regtype
       AND n.nspname IN ('nebula', 'vision')
       AND NOT EXISTS (
         SELECT 1
           FROM pg_trigger t
          WHERE t.tgfoid = p.oid
            AND NOT t.tgisinternal
       )
  LOOP
    EXECUTE format(
      'COMMENT ON FUNCTION %I.%I(%s) IS %L',
      f.schema_name,
      f.function_name,
      f.identity_args,
      'DBA 2026-08-13: unattached trigger-returning function retained pending individual ownership/classification review; no active trigger binding was present when migration 043 ran. It may be historical SCD-4/view-trigger residue, a validation helper, or an orphan; this comment is not a final classification.'
    );
  END LOOP;
END
$$;

COMMENT ON TABLE nebula.schema_version IS
  'Forward ledger for nebula-srv numbered migrations. Versions 001-041 predate per-version ledger tracking and are represented by baseline version 41.';

INSERT INTO nebula.schema_version (version, description)
VALUES (43, 'W3 trigger-residue documentation and nebula migration ledger hardening')
ON CONFLICT (version) DO NOTHING;

COMMIT;

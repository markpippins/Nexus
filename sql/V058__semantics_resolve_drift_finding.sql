-- ═══════════════════════════════════════════════════════════════════════
--  V058 — semantics: resolve_drift_finding proc
--
--  The drift lifecycle in the design (semantics-db.md) is
--  detected → resolved: a finding is born via add_drift_finding with
--  resolved_at NULL, and resolution is a distinct state transition from
--  expiration (a resolved finding stays in the graph; an expired one is
--  soft-deleted history).
--
--  resolve_drift_finding(p_id, p_resolved_at DEFAULT NOW()) → integer
--    • sets resolved_at = p_resolved_at on the finding
--    • only touches rows that are ACTIVE (expired_at IS NULL) and
--      currently UNRESOLVED (resolved_at IS NULL)
--    • returns the number of rows updated — idempotent by design:
--      1 on first resolution, 0 if already resolved, expired, or missing
--      (mirrors the soft_delete_* convention)
--
--  Usage:  psql -h localhost -U pguser -d nexus -f V058__semantics_resolve_drift_finding.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION semantics.resolve_drift_finding(
    p_id            uuid,
    p_resolved_at   timestamptz DEFAULT NOW()
) RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE semantics.drift_finding
    SET    resolved_at = p_resolved_at
    WHERE  id = p_id
      AND  expired_at IS NULL
      AND  resolved_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_sig text;
BEGIN
    SELECT pg_get_function_identity_arguments(p.oid)
      INTO v_sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'semantics' AND p.proname = 'resolve_drift_finding';
    IF v_sig IS NULL THEN
        RAISE EXCEPTION 'V058 verification failed: resolve_drift_finding not found';
    END IF;
    RAISE NOTICE '✅ V058 applied — semantics.resolve_drift_finding(%) exists.', v_sig;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
--  V093 — Q4 P1: backfill entity_key (CCNF content identity) on
--  vision.work_requests
--
--  Plan:      1287 (wrp) — "entity_key (CCNF content identity) at WR birth"
--  Ruling:     Q4 P1 — every WR carries content identity from birth
--  Guarded by: wr-conf-010 (test_conformance_ccnf_identity.py) + pipeline
--              health sweep section 3c (bin/pipeline-health-sweep.py)
--
--  Migration v37 added entity_key but no production write path reliably
--  populated it — all 24 live rows are NULL. This backfill computes each
--  row's entity_key as the CCNF identity of the canonical WR shape (system
--  ``execute`` on the ``workrequest:<wr_id>`` target) keyed on the row's
--  stable `wr_id`, so the backfilled key equals the key the WR would have
--  received at birth via vision_bridge._dco_ccnf_input /
--  nexus_core.wrp.identity.
--
--  The hash is SHA256 over the sorted {domain, intent, actor, scope}
--  signature, byte-identical to:
--    - the pure-Python mirror: emit_identity(ccnf_input_from_dco_json(
--        dco_json, wr_id))  (nexus_core/wrp/identity.py)
--    - the Go reference:     ccnf-conformance process (go/wrp/ccnf-ref)
--    - the Rust verifier:    ccnf-verifier (rust/wrp/ccnf-verifier)
--
--  Verified locally: the SQL-computed value equals the pure-Python mirror
--  for all 24 rows (24/24). wr-conf-010 re-asserts this on every live row
--  and that no row has a NULL entity_key.
--
--  Idempotent; re-runnable (WHERE entity_key IS NULL). Verification: the
--  DO block fails if any row remains NULL (0 NULL), mirroring V089.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- SHA256 digest() lives in pgcrypto (already present on local + Strontium).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE vision.work_requests vwr
SET entity_key = encode(
    digest(
        convert_to('actor', 'UTF8') || '\x00'::bytea
            || convert_to('{"id":"conduit","type":"system"}', 'UTF8')
            || '\x00'::bytea
        || convert_to('domain', 'UTF8') || '\x00'::bytea
            || convert_to('"execution"', 'UTF8') || '\x00'::bytea
        || convert_to('intent', 'UTF8') || '\x00'::bytea
            || convert_to(
                '{"action":"execute","target_id":"workrequest:' || vwr.wr_id
                || '","target_type":"workrequest","type":"normalized_verb"}',
                'UTF8'
            ) || '\x00'::bytea
        || convert_to('scope', 'UTF8') || '\x00'::bytea
            || convert_to('"executiongraph.v2"', 'UTF8') || '\x00'::bytea,
        'sha256'
    ),
    'hex'
)
WHERE vwr.entity_key IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  Verify: 0 NULL entity_key
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_total integer;
    v_null  integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE entity_key IS NULL)
        INTO v_total, v_null FROM vision.work_requests;

    IF v_null > 0 THEN
        RAISE EXCEPTION 'V093 verify: % of % vision.work_requests rows still NULL entity_key', v_null, v_total;
    END IF;

    RAISE NOTICE '✅ V093 applied — entity_key on % vision.work_requests rows (0 NULL).', v_total;
END $$;

COMMIT;

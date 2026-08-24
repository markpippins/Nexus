-- V111: extend nebula.receipts_unified with recorded_on_dt / recorded_until_dt
--
-- The WRP bridge (python/conduit/bridge/sync.py) polls receipts with a
-- (recorded_on_dt, id) checkpoint cursor. V110's unified view mirrored the
-- legacy read shape but omitted these bitemporal record timestamps, which the
-- live vision.receipts table carries — so the bridge could not be repointed
-- at the unified surface without breaking its cursor.
--
-- This migration re-creates nebula.receipts_unified with the two extra
-- columns:
--   - execution branch  → recorded_on_dt = issued_at, recorded_until_dt = NULL
--     (issued_at is the execution-receipt analogue of "when it was recorded")
--   - vision branch     → real values pass through
--
-- Idempotent: CREATE OR REPLACE VIEW.

BEGIN;

CREATE OR REPLACE VIEW nebula.receipts_unified AS
    -- Conduit-lineage execution receipts (the D-T19-2(b) canonical writes).
    SELECT
        COALESCE(e.lineage_original_id, e.id::text)     AS id,
        rq.source_plan_id                               AS plan_id,
        e.type                                          AS type,
        e.agent_role                                    AS agent_role,
        e.metadata ->> 'session_id'                     AS session_id,
        e.metadata ->> 'artifact_path'                  AS artifact_path,
        e.summary                                       AS summary,
        e.metadata::text                                AS metadata_json,
        e.issued_at                                     AS created_at,
        e.metadata ->> 'ticket_id'                      AS ticket_id,
        COALESCE((e.metadata ->> 'tokens_used')::integer, 0) AS tokens_used,
        NULL::integer                                   AS sequence,
        e.issued_at                                     AS recorded_on_dt,
        NULL::timestamptz                               AS recorded_until_dt
    FROM execution.receipts e
    JOIN execution.requests rq ON rq.id = e.request_id
    WHERE e.lineage_source = 'conduit'

    UNION ALL

    -- Frozen legacy surface (D-T19-2(d)).
    SELECT
        id, plan_id, type, agent_role, session_id, artifact_path,
        summary, metadata_json, created_at, ticket_id, tokens_used, sequence,
        recorded_on_dt, recorded_until_dt
    FROM vision.receipts;

COMMIT;
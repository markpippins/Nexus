-- V110: D-T19-2(b) read-path repair — unified receipt read surface
--
-- D-T19-2(b) moved the canonical conduit receipt WRITE to execution.receipts
-- (request-scoped, lineage_source = 'conduit'), leaving vision.receipts as a
-- frozen legacy surface (D-T19-2(d)). The READ paths were never migrated:
-- get_plan_receipts, getLatestReceiptType, and nebula.plan_status all still
-- read vision.receipts only, so any plan whose receipts landed in
-- execution.receipts became invisible (0 receipts, NULL derived_status,
-- dropped out of query_conduit_state entirely).
--
-- This migration introduces nebula.receipts_unified — a UNION ALL of:
--   1. execution.receipts (lineage_source = 'conduit'), projected back into
--      the legacy vision.receipts column shape via the execution.requests
--      join (source_plan_id -> plan_id; metadata -> metadata_json /
--      session_id / ticket_id / artifact_path / tokens_used;
--      lineage_original_id -> id; issued_at -> created_at); and
--   2. vision.receipts (frozen legacy surface, unchanged).
--
-- It then re-points nebula.plan_status (the canonical derived_status view
-- that query_conduit_state reads) at the unified surface. The two surfaces
-- are disjoint (insertReceipt writes to exactly one), so UNION ALL is safe.
--
-- Idempotent: CREATE OR REPLACE VIEW throughout.

BEGIN;

-- ── 1. Unified receipt read surface ──────────────────────────────────
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
        NULL::integer                                   AS sequence
    FROM execution.receipts e
    JOIN execution.requests rq ON rq.id = e.request_id
    WHERE e.lineage_source = 'conduit'

    UNION ALL

    -- Frozen legacy surface (D-T19-2(d)).
    SELECT
        id, plan_id, type, agent_role, session_id, artifact_path,
        summary, metadata_json, created_at, ticket_id, tokens_used, sequence
    FROM vision.receipts;

-- ── 2. Re-point nebula.plan_status at the unified surface ────────────
--     (logically identical to migration 040; only the receipt source changes)
CREATE OR REPLACE VIEW nebula.plan_status AS
SELECT
  p.id,
  p.file_name,
  p.title,
  p.project,
  p.goal,
  p.content,
  p.files_affected,
  p.acceptance_criteria,
  p.dependencies,
  p.prompt_ref,
  p.notes,
  p.priority,
  p.created_at,
  p.updated_at,
  p.deleted,
  CASE
    -- HOLD: highest priority — if the latest receipt is HOLD, show it regardless
    WHEN EXISTS (
      SELECT 1 FROM nebula.receipts_unified r WHERE r.plan_id = p.id AND r.type = 'HOLD'
      AND NOT EXISTS (
        SELECT 1 FROM nebula.receipts_unified r2
        WHERE r2.plan_id = p.id
        AND r2.type IN ('CANCELLED', 'ABANDONED')
        AND r2.created_at > r.created_at
      )
    ) THEN 'HOLD'
    -- REQUEUED: circuit breaker reset — checked early so it can override even
    -- REVIEW_PASS (e.g. plan was completed, then manually requeued for retry).
    WHEN (
      SELECT r.type FROM nebula.receipts_unified r
      WHERE r.plan_id = p.id
      AND r.type NOT IN ('PLANNING', 'HOLD')
      ORDER BY r.created_at DESC LIMIT 1
    ) = 'REQUEUED' THEN 'PLAN_CREATE'
    -- REVIEW_PASS — terminal success, unless overridden by later BLOCK/PLAN_BLOCK
    WHEN EXISTS (
      SELECT 1 FROM nebula.receipts_unified r WHERE r.plan_id = p.id AND r.type = 'REVIEW_PASS'
      AND NOT EXISTS (
        SELECT 1 FROM nebula.receipts_unified r2
        WHERE r2.plan_id = p.id
        AND r2.type IN ('BLOCK', 'PLAN_BLOCK', 'CANCELLED', 'ABANDONED')
        AND r2.created_at > r.created_at
      )
    ) THEN 'REVIEW_PASS'
    -- REVIEW_REJECT — show latest non-BLOCK receipt or fallback to PLAN_CREATE
    WHEN EXISTS (
      SELECT 1 FROM nebula.receipts_unified r WHERE r.plan_id = p.id AND r.type = 'REVIEW_REJECT'
    ) THEN COALESCE(
      (SELECT r.type FROM nebula.receipts_unified r
       WHERE r.plan_id = p.id
       AND r.type != 'BLOCK'
       ORDER BY r.created_at DESC LIMIT 1),
      'PLAN_CREATE'
    )
    ELSE COALESCE(
      (SELECT r.type FROM nebula.receipts_unified r
       WHERE r.plan_id = p.id
       AND r.type NOT IN ('PLANNING', 'HOLD')
       ORDER BY r.created_at DESC LIMIT 1),
      (SELECT r.type FROM nebula.receipts_unified r
       WHERE r.plan_id = p.id
       ORDER BY r.created_at DESC LIMIT 1),
      NULL
    )
  END AS derived_status
FROM nebula.plans p
WHERE p.deleted = 0;

COMMIT;

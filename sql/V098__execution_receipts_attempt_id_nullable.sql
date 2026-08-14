-- V098: D-T19-2a — execution.receipts.attempt_id nullable + migrate request-linked receipts
--
-- Architect decision (D-T19-2a, Option 1): receipts are request-level.
--   * request_id stays mandatory (minimum traceable unit = execution request).
--   * attempt_id becomes optional (NULL for request-level lifecycle receipts;
--     set only for genuinely attempt-scoped execution-plane receipts).
--   * The 170 request-linked-but-attempt-less vision.receipts rows are migrated
--     with attempt_id = NULL (no fabricated "latest attempt" links — honest
--     provenance on the canonical evidence surface).
--   * The 46 test/synthetic orphan rows (no execution.requests row) stay in
--     vision.receipts, preserved by the D-T19-2(d) freeze/archive.

BEGIN;

-- (a) Relax attempt_id nullability.
ALTER TABLE execution.receipts ALTER COLUMN attempt_id DROP NOT NULL;

-- (b) Migrate the request-linked, attempt-less receipts (idempotent).
INSERT INTO execution.receipts (
    attempt_id, request_id, type, agent_role, summary, metadata,
    lineage_source, lineage_original_id, issued_at
)
SELECT
    NULL,                         -- attempt_id: request-level receipt, no attempt
    er.id,                        -- request_id
    vr.type,
    vr.agent_role,
    COALESCE(vr.summary, ''),
    COALESCE(vr.metadata_json::jsonb, '{}'::jsonb),
    'vision.receipts',
    vr.id,
    vr.created_at
FROM vision.receipts vr
JOIN execution.requests er ON er.source_plan_id = vr.plan_id
WHERE NOT EXISTS (
    SELECT 1 FROM execution.receipts er2
    WHERE er2.lineage_original_id = vr.id
);

COMMIT;

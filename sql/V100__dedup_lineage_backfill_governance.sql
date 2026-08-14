-- V100: D-T19-2(e) — dedup lineage + backfill governance for native execution.receipts
--
-- 1. Dedup pre-existing duplicate lineage_original_id rows (attempt-join fan-out
--    from the old v33/v34 migration — 6 groups, 15 redundant rows). Keep the
--    earliest per lineage_original_id.
-- 2. Backfill peb.governance_events for execution.receipts rows that lack one
--    (native attempt-scoped receipts written before the V099 trigger existed),
--    resolving plan_id + work_request_id from the execution.requests chain.

BEGIN;

-- 1. Dedup (maintenance — temporarily disable the append-only guard).
ALTER TABLE execution.receipts DISABLE TRIGGER trg_receipts_immutable;

DELETE FROM execution.receipts
WHERE lineage_source = 'vision.receipts'
  AND id NOT IN (
    SELECT DISTINCT ON (lineage_original_id) id
    FROM execution.receipts
    WHERE lineage_source = 'vision.receipts'
    ORDER BY lineage_original_id, issued_at ASC, id ASC
  );

ALTER TABLE execution.receipts ENABLE TRIGGER trg_receipts_immutable;

-- 2. Backfill governance events for execution.receipts lacking one.
INSERT INTO peb.governance_events
  (receipt_id, event_type, work_request_id, plan_id, agent_role, payload)
SELECT
  er.id::text,
  'receipt:' || er.type,
  req.source_wr_id::text,
  COALESCE(req.source_plan_id, COALESCE(er.lineage_original_id, 'unknown')),
  er.agent_role,
  COALESCE(er.metadata, '{}'::jsonb)
FROM execution.receipts er
JOIN execution.requests req ON req.id = er.request_id
WHERE NOT EXISTS (
  SELECT 1 FROM peb.governance_events g
  WHERE g.receipt_id = er.id::text OR g.receipt_id = er.lineage_original_id
);

COMMIT;

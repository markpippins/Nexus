-- V099: D-T19-2(c) — re-point governance trigger vision.receipts → execution.receipts
--
-- PEB is a downstream governance/evidence projection of the canonical receipt
-- surface (execution.receipts). The legacy trigger on vision.receipts is retired;
-- the new trigger on execution.receipts resolves plan_id + work_request_id from
-- the execution.requests chain (source_plan_id / source_wr_id).

BEGIN;

-- 1. Retire the legacy trigger + function on vision.receipts.
DROP TRIGGER IF EXISTS trg_receipt_governance ON vision.receipts;
DROP FUNCTION IF EXISTS vision.receipt_governance_trigger();

-- 2. New trigger function: execution.receipts → peb.governance_events.
CREATE OR REPLACE FUNCTION execution.receipt_governance_trigger()
RETURNS TRIGGER AS $TRIG$
DECLARE
  v_plan_id TEXT;
  v_wr_id TEXT;
BEGIN
  SELECT r.source_plan_id, r.source_wr_id::text
    INTO v_plan_id, v_wr_id
  FROM execution.requests r
  WHERE r.id = NEW.request_id;

  INSERT INTO peb.governance_events
    (receipt_id, event_type, work_request_id, plan_id, agent_role, payload)
  VALUES (
    NEW.id::text,
    'receipt:' || NEW.type,
    v_wr_id,
    COALESCE(v_plan_id, COALESCE(NEW.lineage_original_id, 'unknown')),
    NEW.agent_role,
    COALESCE(NEW.metadata, '{}'::jsonb)
  )
  ON CONFLICT (receipt_id) DO NOTHING;
  RETURN NEW;
END;
$TRIG$ LANGUAGE plpgsql;

-- 3. Attach the new trigger on execution.receipts.
DROP TRIGGER IF EXISTS trg_receipt_governance ON execution.receipts;
CREATE TRIGGER trg_receipt_governance
AFTER INSERT ON execution.receipts
FOR EACH ROW
EXECUTE FUNCTION execution.receipt_governance_trigger();

COMMIT;

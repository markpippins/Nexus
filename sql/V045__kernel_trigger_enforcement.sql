-- V045: Kernel trigger attachment + cycle guard + receipt enforcement
--
-- Priority 1: Attach trg_authorize_transition to transition_event
-- Priority 2: Add cycle guard to v_causality_chain
-- Priority 3: Add BEFORE INSERT trigger on kernel.receipt

BEGIN;

-- =====================================================================
-- P1: Attach trg_authorize_transition to kernel.transition_event
-- =====================================================================
-- BEFORE INSERT — fires for ALL insert paths (sys_transition, raw psql, migration)
-- This is the sharpest fix: turns "convention-enforced" into "construction-enforced"

CREATE TRIGGER trg_authorize_transition
    BEFORE INSERT ON kernel.transition_event
    FOR EACH ROW
    EXECUTE FUNCTION kernel.trg_authorize_transition();

-- =====================================================================
-- P1b: Attach trg_notify_transition to kernel.transition_event
-- =====================================================================
-- AFTER INSERT — emits pg_notify for cascade/projection workers

CREATE TRIGGER trg_notify_transition
    AFTER INSERT ON kernel.transition_event
    FOR EACH ROW
    EXECUTE FUNCTION kernel.trg_notify_transition();

-- =====================================================================
-- P1c: Attach trg_policy_rule_updated_at to kernel.policy_rule
-- =====================================================================

CREATE TRIGGER trg_policy_rule_updated_at
    BEFORE UPDATE ON kernel.policy_rule
    FOR EACH ROW
    EXECUTE FUNCTION kernel.trg_policy_rule_updated_at();


-- =====================================================================
-- P2: Add cycle guard to v_causality_chain
-- =====================================================================
-- Drop and recreate with cycle detection in the recursive branch

DROP VIEW IF EXISTS kernel.v_causality_chain;

CREATE VIEW kernel.v_causality_chain AS
WITH RECURSIVE chain AS (
    -- Anchor: root events (no causation_id)
    SELECT
        te.id,
        te.event_id,
        te.event_type,
        te.aggregate_type,
        te.aggregate_id,
        te.actor,
        te.causation_id,
        te.correlation_id,
        te."timestamp",
        0 AS depth,
        ARRAY[te.event_id::text] AS path
    FROM kernel.transition_event te
    WHERE te.causation_id IS NULL

    UNION ALL

    -- Recursive: follow causation链, with cycle guard
    SELECT
        te.id,
        te.event_id,
        te.event_type,
        te.aggregate_type,
        te.aggregate_id,
        te.actor,
        te.causation_id,
        te.correlation_id,
        te."timestamp",
        c.depth + 1,
        c.path || te.event_id::text
    FROM kernel.transition_event te
    JOIN chain c ON c.event_id = te.causation_id
    WHERE NOT te.event_id::text = ANY(c.path)  -- cycle guard
)
SELECT
    id,
    event_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor,
    causation_id,
    correlation_id,
    "timestamp",
    depth,
    path
FROM chain;


-- =====================================================================
-- P3: BEFORE INSERT trigger on kernel.receipt
-- =====================================================================
-- Re-runs the three validation checks from sys_issue_receipt()
-- so that raw INSERTs are also blocked. Makes "sole write surface" true.

CREATE OR REPLACE FUNCTION kernel.trg_authorize_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check 1: receipt_hash required
    IF length(trim(NEW.receipt_hash)) = 0 THEN
        RAISE EXCEPTION 'RECEIPT_DENIED: receipt_hash is required'
            USING HINT = 'Every receipt must have a content hash';
    END IF;

    -- Check 2: issued_by required
    IF length(trim(NEW.issued_by)) = 0 THEN
        RAISE EXCEPTION 'RECEIPT_DENIED: issued_by is required'
            USING HINT = 'Every receipt must specify an issuer';
    END IF;

    -- Check 3: referenced event must exist
    IF NOT EXISTS (
        SELECT 1 FROM kernel.transition_event
        WHERE event_id = NEW.event_id
    ) THEN
        RAISE EXCEPTION 'RECEIPT_DENIED: event % does not exist', NEW.event_id
            USING HINT = 'Cannot issue a receipt for a non-existent event';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_authorize_receipt
    BEFORE INSERT ON kernel.receipt
    FOR EACH ROW
    EXECUTE FUNCTION kernel.trg_authorize_receipt();


COMMIT;

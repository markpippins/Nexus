-- Migration 034: Create work_request_overview projection view
--
-- Provides a unified view of work requests across all three layers:
--   business_status (nebula)  → Should this happen?
--   status (execution)        → Can this happen?
--   status (vision)           → What is happening right now?
--
-- The effective_status is a projection, not authority. It's derived from
-- the three layer statuses for human consumption.

CREATE OR REPLACE VIEW nebula.v_work_request_overview AS
SELECT
    -- Identity
    wr.id,
    wr.legacy_id,
    wr.title,
    wr.plan_id,
    
    -- Business layer (nebula)
    wr.business_status,
    wr.consumed_at,
    wr.created_at as business_created_at,
    
    -- Execution layer (execution)
    er.status as execution_status,
    er.id as execution_request_id,
    er.business_key,
    
    -- Runtime layer (vision)
    vr.status as runtime_status,
    vr.work_request_uuid as vision_id,
    
    -- Derived effective status for humans
    CASE
        -- Terminal states
        WHEN wr.business_status = 'CANCELLED' THEN 'CANCELLED'
        WHEN vr.status = 'rejected' THEN 'REJECTED'
        WHEN vr.status = 'failed' THEN 'FAILED'
        
        -- Completion states
        WHEN wr.business_status = 'COMPLETED' AND vr.status = 'settled' THEN 'COMPLETE'
        WHEN wr.business_status = 'COMPLETED' THEN 'AWAITING_REVIEW'
        WHEN vr.status = 'settled' THEN 'SETTLED_AWAITING_BUSINESS'
        
        -- Active states
        WHEN vr.status = 'claimed' THEN 'RUNNING'
        WHEN vr.status = 'validated' THEN 'VALIDATED'
        WHEN vr.status = 'queued' THEN 'QUEUED'
        WHEN vr.status = 'deferred' THEN 'DEFERRED'
        WHEN vr.status = 'noop' THEN 'NOOP'
        
        -- Execution states
        WHEN er.status = 'READY' THEN 'READY_FOR_EXECUTION'
        WHEN er.status = 'ADMITTED' THEN 'ADMITTED'
        WHEN er.status = 'VALIDATED' THEN 'EXECUTION_VALIDATED'
        WHEN er.status = 'COMPLETED' THEN 'EXECUTION_COMPLETE'
        WHEN er.status = 'FAILED' THEN 'EXECUTION_FAILED'
        
        -- Business states
        WHEN wr.business_status = 'DISPATCHED' THEN 'DISPATCHED'
        WHEN wr.business_status = 'APPROVED' THEN 'APPROVED'
        WHEN wr.business_status = 'DRAFT' AND wr.consumed_at IS NULL THEN 'PENDING'
        WHEN wr.business_status = 'DRAFT' THEN 'DRAFT'
        
        -- Fallback
        ELSE 'UNKNOWN'
    END as effective_status,
    
    -- Human-readable summary
    CASE
        WHEN wr.business_status = 'CANCELLED' THEN 'Business intent cancelled'
        WHEN vr.status = 'rejected' THEN 'Execution rejected'
        WHEN vr.status = 'failed' THEN 'Execution failed'
        WHEN wr.business_status = 'COMPLETED' AND vr.status = 'settled' THEN 'Complete - business objective satisfied'
        WHEN wr.business_status = 'COMPLETED' THEN 'Awaiting business review'
        WHEN vr.status = 'settled' THEN 'Settled - awaiting business confirmation'
        WHEN vr.status = 'claimed' THEN 'Worker actively executing'
        WHEN vr.status = 'validated' THEN 'Validated - awaiting execution'
        WHEN vr.status = 'queued' THEN 'Queued for execution'
        WHEN er.status = 'READY' THEN 'Ready for execution'
        WHEN wr.business_status = 'DISPATCHED' THEN 'Dispatched to execution layer'
        WHEN wr.business_status = 'APPROVED' THEN 'Approved - awaiting compilation'
        WHEN wr.consumed_at IS NULL THEN 'Pending - not yet consumed'
        ELSE 'Draft'
    END as effective_status_description
    
FROM nebula.work_requests wr
LEFT JOIN execution.requests er ON er.source_wr_id = wr.id
LEFT JOIN vision.work_requests vr ON vr.work_request_uuid = wr.id::text;

-- Add comment
COMMENT ON VIEW nebula.v_work_request_overview IS
    'Unified view of work requests across business, execution, and runtime layers. effective_status is a projection for human consumption, not authority.';

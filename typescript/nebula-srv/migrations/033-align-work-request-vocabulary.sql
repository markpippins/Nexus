-- Migration 033: Align nebula.work_requests vocabulary
--
-- Implements the three-layer architecture:
--   business_status (nebula)  → Should this happen?
--   execution_status (execution) → Can this happen?
--   runtime_status (vision)   → What is happening right now?
--
-- Also adds consumed_at timestamp to replace 'completed' status
-- which is actually an idempotency marker for the harvest process.

-- Step 1: Add consumed_at timestamp for harvest idempotency
ALTER TABLE nebula.work_requests
    ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

-- Step 2: Backfill consumed_at from 'completed' status
UPDATE nebula.work_requests
SET consumed_at = updated_at
WHERE status = 'completed';

-- Step 3: Rename status to business_status
ALTER TABLE nebula.work_requests
    RENAME COLUMN status TO business_status;

-- Step 4: Drop old CHECK constraint
ALTER TABLE nebula.work_requests
    DROP CONSTRAINT IF EXISTS work_requests_status_check;

-- Step 5: Add new CHECK constraint with only business lifecycle values
-- Business intent: Should this happen?
--   DRAFT → APPROVED → DISPATCHED → COMPLETED/CANCELLED
ALTER TABLE nebula.work_requests
    ADD CONSTRAINT work_requests_business_status_check
    CHECK (business_status IN (
        'DRAFT',           -- Initial state
        'APPROVED',        -- Business intent approved
        'DISPATCHED',      -- Sent to execution layer
        'COMPLETED',       -- Business objective satisfied (human review)
        'CANCELLED'        -- Business intent cancelled
    ));

-- Step 6: Migrate conduit statuses to business statuses
-- pending → DRAFT (business intent exists, not yet approved)
-- failed → CANCELLED (execution failed, business intent cancelled)
-- rate_limited → DRAFT (can be retried)
-- completed → DISPATCHED (sent to execution, consumed_at marks completion)
UPDATE nebula.work_requests
SET business_status = CASE
    WHEN business_status = 'pending' THEN 'DRAFT'
    WHEN business_status = 'failed' THEN 'CANCELLED'
    WHEN business_status = 'rate_limited' THEN 'DRAFT'
    WHEN business_status = 'completed' THEN 'DISPATCHED'
    ELSE business_status
END;

-- Step 7: Add index on consumed_at for harvest queries
CREATE INDEX IF NOT EXISTS idx_work_requests_consumed_at
    ON nebula.work_requests (consumed_at)
    WHERE consumed_at IS NULL;

-- Step 8: Add index on business_status for filtering
CREATE INDEX IF NOT EXISTS idx_work_requests_business_status
    ON nebula.work_requests (business_status);

-- Step 9: Update comments
COMMENT ON COLUMN nebula.work_requests.business_status IS
    'Business lifecycle state: Should this happen? DRAFT → APPROVED → DISPATCHED → COMPLETED/CANCELLED';
COMMENT ON COLUMN nebula.work_requests.consumed_at IS
    'Idempotency marker for harvest process. NULL = not yet consumed. Set when work request is processed by execution layer.';

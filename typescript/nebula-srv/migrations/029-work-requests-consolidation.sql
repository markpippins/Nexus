-- Migration 029: Consolidate conduit.work_requests into nebula.work_requests
--
-- This migration:
-- 1. Adds missing columns to nebula.work_requests (dco_json, legacy_id, plan_id, step_outputs)
-- 2. Expands the status CHECK constraint to include conduit statuses
-- 3. Backfills from conduit.work_requests with generated UUIDs
-- 4. Preserves legacy TEXT IDs in legacy_id for knowledge graph compatibility

-- Step 1: Add missing columns
ALTER TABLE nebula.work_requests
    ADD COLUMN IF NOT EXISTS dco_json text,
    ADD COLUMN IF NOT EXISTS legacy_id text,
    ADD COLUMN IF NOT EXISTS plan_id text,
    ADD COLUMN IF NOT EXISTS step_outputs text NOT NULL DEFAULT '{}';

-- Step 2: Expand status CHECK constraint to include conduit statuses
-- Original: DRAFT, APPROVED, DISPATCHED, COMPLETED, CANCELLED
-- Added: pending, completed, failed, rate_limited (from conduit)
ALTER TABLE nebula.work_requests
    DROP CONSTRAINT IF EXISTS work_requests_status_check;

ALTER TABLE nebula.work_requests
    ADD CONSTRAINT work_requests_status_check
    CHECK (status IN (
        'DRAFT', 'APPROVED', 'DISPATCHED', 'COMPLETED', 'CANCELLED',
        'pending', 'completed', 'failed', 'rate_limited'
    ));

-- Step 3: Create index on legacy_id for KG lookups
CREATE INDEX IF NOT EXISTS idx_work_requests_legacy_id
    ON nebula.work_requests (legacy_id)
    WHERE legacy_id IS NOT NULL;

-- Step 4: Create index on plan_id for plan lookups
CREATE INDEX IF NOT EXISTS idx_work_requests_plan_id
    ON nebula.work_requests (plan_id)
    WHERE plan_id IS NOT NULL;

-- Step 5: Backfill from conduit.work_requests
-- Generates new UUIDs, maps TEXT IDs to legacy_id
INSERT INTO nebula.work_requests (
    id,
    title,
    description,
    status,
    intent,
    context,
    constraints,
    created_by,
    created_at,
    updated_at,
    dco_json,
    legacy_id,
    plan_id,
    step_outputs
)
SELECT
    gen_random_uuid() as id,
    c.title,
    NULL as description,
    c.status,
    NULL as intent,
    jsonb_build_object(
        'source', 'conduit_backfill',
        'conduit_id', c.id
    ) as context,
    '{}'::jsonb as constraints,
    'conduit-pipeline' as created_by,
    c.created_at,
    c.updated_at,
    c.dco_json,
    c.id as legacy_id,
    c.plan_id,
    '{}' as step_outputs
FROM conduit.work_requests c
ON CONFLICT DO NOTHING;

-- Step 6: Add comments
COMMENT ON TABLE nebula.work_requests IS
    'Canonical work request table. Replaces conduit.work_requests as of migration 029.';
COMMENT ON COLUMN nebula.work_requests.dco_json IS
    'Decomposition Command Object JSON. The compiled form of the work request.';
COMMENT ON COLUMN nebula.work_requests.legacy_id IS
    'Original TEXT ID from conduit.work_requests (e.g., wr-0130-1781781240). Preserved for knowledge graph compatibility.';
COMMENT ON COLUMN nebula.work_requests.plan_id IS
    'Reference to the implementation plan. Matches conduit.work_requests.plan_id format.';
COMMENT ON COLUMN nebula.work_requests.step_outputs IS
    'JSON object tracking outputs from each execution step.';
